const async = require("async");
const cors = require("cors");
const ethers = require('ethers');
const express = require("express");
const NodeCache = require("node-cache");

const app = express();
const config = require("./config.json");
const greylist = new NodeCache({ stdTTL: 60 * 60 * 24 });
const accesskey = require("./static/src/accesskey.json").key;

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

// lookup if there is an exception made for this address
function getException(key) {
  const val = greylist.get(key);
  if (!val) return;
  return ({
    ...val,
    key
  })
}

// set an exception for this address ( greylist / blacklist )
function setException(key, reason) {
  if (key && key !== undefined) {
    greylist.set(key, { reason });
  } else {
    console.log(`no key given to setException`)
  }
}

app.get("/q", function (req, res) {
  return res.status(200).json(
    {
      last: [...donations],
      current: [...q],
      exceptions: greylist.getStats().keys
    });
});

app.get(`/donate/:address`, function (req, res) {
  console.log(`request on old endpoint.. keeping them busy`);
  setTimeout(()=>{
    res.status(200).json({ message: "ok" });
  },60*1000)
});

// try to add an address to the donation queue
app.get(`/donate/${accesskey}/:address`, function (req, res) {
  // Strip all spaces
  var address = req.params.address.replace(" ", "");
  try {
    // check for valid Eth address
    // then convert it to checksum address with 0x prefix
    address = ethers.utils.getAddress(address);
    //console.log("Fix address", address);
  } catch (error) {
    return res.status(400).json({
      message: "the address is invalid"
    });
  }
  var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/\./g, "_");
  // check if address/ip is not greylisted or blacklisted
  const exception = getException(address) || getException(ip);
  if (exception) {
    if (exception.reason === "greylist") {
      console.log(exception.key, "is on the greylist");
      // extend greylist
      setException(ip, "greylist");
      setException(address, "greylist");
      return res.status(403).json({
        address: exception.address,
        message: "you are greylisted - greylist period is now reset on this ip and address",
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
  setException(ip, "greylist");
  setException(address, "greylist");
  return res.status(200).json({ message: "request added to the queue" });
});

function donate(to, cb) {
  return donateAmount(to, config.payoutamountinether, cb);
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
