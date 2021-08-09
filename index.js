var express = require("express");
var app = express();
var cors = require("cors");
var config = require("./config.json");
const mkdirp = require("mkdirp");
const level = require("level");
const ethers = require('ethers');
const async = require("async");

// DB for storing exceptions (greylist/blacklist)
mkdirp.sync(require("os").homedir() + "/.ethfaucetssl/exceptions");
const dbExceptions = level(
  require("os").homedir() + "/.ethfaucetssl/exceptions"
);
const greylistduration = 1000 * 60 * 60 * 24;

// check for valid Eth address
function isAddress(address) {
  return /^(0x)?[0-9a-f]{40}$/i.test(address);
}

// Add 0x to address
function fixaddress(address) {
  // Strip all spaces
  address = address.replace(" ", "");
  // Address lowercase
  address = address.toLowerCase();
  //console.log("Fix address", address);
  if (!strStartsWith(address, "0x")) {
    return "0x" + address;
  }
  return address;
}

function strStartsWith(str, prefix) {
  return str.indexOf(prefix) === 0;
}

// set up wallet
console.log(`connecting to ${config.web3.host}`);
var customHttpProvider = new ethers.providers.JsonRpcProvider(config.web3.host);
let wallet = new ethers.Wallet(config.walletpk, customHttpProvider);
console.log(`wallet address = ${wallet.address}`);

let donations = [];

// create payout queue
const q = async.queue((task, callback) => {
  console.log(`donating to ${task.address}`);
  donate(task.address, (err, txHash) => {
    if (err) {

    }
    if (txHash) {
      donations.push({
        address: task.address,
        txhash: txHash
      });
      while (donations.length > 5) {
        donations.shift();
      }
    }
    console.log(`waiting ${config.payoutfrequencyinsec} sec`);
    setTimeout(callback, config.payoutfrequencyinsec * 1000);

  })
}, 1);

q.drain(() => {
  console.log(`Queue empty.`)
})

// Get faucet balance in ether
const getFaucetBalance = async () => {
  const balance = await wallet.getBalance()
  return parseFloat(ethers.utils.formatUnits(balance))
};

app.use(cors());

// frontend app is served from here
app.use(express.static("static/build"));

// get current faucet info
app.get("/faucetinfo", async (req, res) => {
  var ip = req.headers["x-forwarded-for"] || req.remoteAddress;
  console.log("client IP=", ip);
  var etherbalance = -1;
  try {
    etherbalance = await getFaucetBalance();
  } catch (e) {
    console.log(e);
  }
  res.status(200).json({
    account: wallet.address,
    balance: Math.floor(etherbalance),
    etherscanroot: config.etherscanroot,
    payoutfrequencyinsec: config.payoutfrequencyinsec,
    payoutamountinether: config.payoutamountinether,
    queuesize: config.queuesize,
    queuename: "queue"
  });
});

app.get("/blacklist/:address", function (req, res) {
  var address = fixaddress(req.params.address);
  if (isAddress(address)) {
    setException(address, "blacklist").then(() => {
      res.status(200).json({
        msg: "address added to blacklist"
      });
    });
  } else {
    return res.status(400).json({
      message: "the address is invalid"
    });
  }
});

// cleanup greylist
setInterval(() => {
  cleanupException();
}, 60 * 60 * 1000);

// lookup if there is an exception made for this address
function getException(address) {
  return new Promise((resolve, reject) => {
    dbExceptions.get(address, function (err, value) {
      if (err) {
        if (err.notFound) {
          // handle a 'NotFoundError' here
          return resolve();
        }
        // I/O or other error, pass it up the callback chain
        return reject(err);
      }
      value = JSON.parse(value);
      resolve(value);
    });
  });
}

// set an exception for this address ( greylist / blacklist )
function setException(address, reason) {
  console.log(`adding ${address} to ${reason}`)
  return new Promise((resolve, reject) => {
    dbExceptions.put(
      address,
      JSON.stringify({
        created: Date.now(),
        reason: reason,
        address: address
      }),
      function (err) {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

// check if there are items in the exception queue that need to be cleaned up.
function cleanupException() {
  dbExceptions
    .createReadStream({
      keys: true,
      values: true
    })
    .on("data", item => {
      const value = JSON.parse(item.value);
      if (value.reason === "greylist") {
        if (value.created < Date.now() - greylistduration) {
          dbExceptions.del(item.key, err => {
            console.log("removed ", item.key, "from greylist");
          });
        }
      }
    });
}

app.get("/q", function (req, res) {
  return res.status(200).json(
    {
      last: [...donations],
      current: [...q]
    });
});

// try to add an address to the donation queue
app.get("/donate/:address", function (req, res) {
  var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/\./g, "_");
  var address = fixaddress(req.params.address);
  if (isAddress(address)) {
    Promise.all([
      getException(address),
      getException(ip)
    ])
      .then(
        ([addressException, ipException]) => {
          var exception = addressException || ipException;
          // check if address/ip is not greylisted or blacklisted
          if (exception) {
            if (exception.reason === "greylist") {
              console.log(exception.address, "is on the greylist");
              // extend greylist
              // setException(ip, "greylist");
              setException(address, "greylist");
              return res.status(403).json({
                address: exception.address,
                message: "you are greylisted - greylist period is now reset on this ip and address",
                duration: exception.created + greylistduration - Date.now()
              });
            }
            if (exception.reason === "blacklist") {
              console.log(exception.address, "is on the blacklist");
              return res.status(403).json({
                address: address,
                message: "you are blacklisted"
              });
            }
          }
          // check if queue is not full
          if (q.length() >= config.queuesize) {
            return res.status(403).json({
              message: "queue is full. Try again later."
            });
          }

          q.push({ address });
          // setException(ip, "greylist");
          // setException(address, "greylist");
          return res.status(200).json({ message: "request added to the queue" });

        }
      );
  } else {
    return res.status(400).json({
      message: "the address is invalid"
    });
  }
});

function donate(to, cb) {
  // return donateAmount(to, config.payoutamountinether, cb);
  cb(null, "hashhash");
}

function donateAmount(to, amount, cb) {
  console.log(`donating ${amount} ETH to: ${to}`);

  const tx = {
    to,
    value: ethers.utils.parseEther(amount.toString())
  }

  wallet.sendTransaction(tx)
    .then((txObj) => {
      // console.log('txHash', txObj.hash)
      return cb(null, txObj.hash);
    }).catch((e) => {
      return cb(e.message);
    });
}

// start API
app.listen(config.httpport, function () {
  console.log(`faucet listening on port ${config.httpport}`);
});
