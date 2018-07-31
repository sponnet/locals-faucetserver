var express = require('express');
var app = express();
var cors = require('cors');
var Web3 = require('web3');
var HookedWeb3Provider = require("hooked-web3-provider");
var lightwallet = require("eth-lightwallet");
var config = require('./config.json');
var Firebase = require('firebase');
var Queue = require('firebase-queue');
var myRootRef = new Firebase(config.firebase.url);

var faucet_keystore = JSON.stringify(require("./wallet.json"));

var secretSeed = lightwallet.keystore.generateRandomSeed();

// check for valid Eth address
function isAddress(address) {
	return /^(0x)?[0-9a-f]{40}$/i.test(address);
};

// Add 0x to address 
function fixaddress(address) {
	// Strip all spaces
	address = address.replace(' ', '');

	//console.log("Fix address", address);
	if (!strStartsWith(address, '0x')) {
		return ('0x' + address);
	}
	return address;
}

function strStartsWith(str, prefix) {
	return str.indexOf(prefix) === 0;
}

var account;
var web3;

var nextdrip;


myRootRef.authWithCustomToken(config.firebase.secret, function(error, authData) {
	if (error) {
		console.log("Firebase Login Failed!", error);
		proccess.exit();
	} else {
		console.log("Firebase Login Succeeded!", authData);

		lightwallet.keystore.deriveKeyFromPassword("test", function(err, pwDerivedKey) {

			lightwallet.upgrade.upgradeOldSerialized(faucet_keystore, "testing", function(err, b) {

				var keystore = new lightwallet.keystore.deserialize(b);

				console.log('connecting to ETH node: ', config.web3.host);

				var web3Provider = new HookedWeb3Provider({
					host: config.web3.host,
					transaction_signer: keystore
				});

				web3 = new Web3();
				web3.setProvider(web3Provider);

				keystore.passwordProvider = function(callback) {
					callback(null, "testing");
				};

				console.log("Wallet initted addr=" + keystore.getAddresses()[0]);

				account = fixaddress(keystore.getAddresses()[0]);

				// start webserver...
				app.listen(config.httpport, function() {
					console.log('Fawcet listening on port ', config.httpport);
				});

			});

		});
	}
});

function getTimeStamp() {
	return Math.floor(new Date().getTime() / 1000);
}

// Get faucet balance in ether ( or other denomination if given )
function getFaucetBalance(denomination) {
	return parseFloat(web3.fromWei(web3.eth.getBalance(account).toNumber(), denomination || 'ether'));
}

app.use(cors());

// polymer app is served from here
app.use(express.static('static/locals-faucet/dist'));

var randomQueueName = "queue" + Date.now();
var blacklistName = "blacklist";
var greylistName = "greylist";

// get current faucet info
app.get('/faucetinfo', function(req, res) {
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	console.log('client IP=',ip);
	var etherbalance = -1;
	try {
		etherbalance = getFaucetBalance();
	} catch (e) {
		console.log(e);
	}
	res.status(200).json({
		account: account,
		balance: etherbalance,
		etherscanroot: config.etherscanroot,
		payoutfrequencyinsec: config.payoutfrequencyinsec,
		payoutamountinether: config.payoutamountinether,
		queuesize: config.queuesize,
		queuename: randomQueueName
	});
});

// Creates the Queue
var options = {
	numWorkers: config.queuesize,
	sanitize: false
};

var queueRef = myRootRef.child(randomQueueName);
var blacklist = myRootRef.child(blacklistName);
var greylist = myRootRef.child(greylistName);

var nextpayout = getTimeStamp();

var queue = new Queue(queueRef, options, function(data, progress, resolve, reject) {
	// Read and process task data
	console.log('queue item is here...')
	console.log(data);

	// if (nextpayout - getTimeStamp() > 0) {
	// need to wait 

	var delay = data.paydate - getTimeStamp();

	console.log('next payout in ', delay, 'sec');

	if (delay < 0) {
		delay = 0;
	}

	setTimeout(function() {


		donate(data.address, function(err, result) {
			if (err) {
				console.log(err);
				reject();
			}

			queueRef.child('tasks').child(data._id).child('txhash').set(result)
				.then(function() {
					console.log('tx set');
				});

			setTimeout(function() {
				resolve();
				console.log('resolved');
			}, 20 * 1000);

		});


	}, delay * 1000);

});

app.get('/blacklist/:address', function(req, res) {
	var address = fixaddress(req.params.address);
	if (isAddress(address)) {
		blacklist.child(address).set(Date.now());
		res.status(200).json({
			msg: 'address added to blacklist'
		});
	} else {
		return res.status(400).json({
			message: 'the address is invalid'
		});
	}
});

// add our address to the donation queue
app.get('/donate/:address', function(req, res) {
	console.log('push');

	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	ip = ip.replace(/\./g,'_');

	var address = fixaddress(req.params.address);
	if (isAddress(address)) {
		blacklist.child(address).once('value', function(snapshot) {
			var exists = (snapshot.val() !== null);
			if (exists) {
				console.log(address,'->blacklist');
				return res.status(200).json({
					paydate: 0,
					address: address,
					amount: 0,
					message: 'you are blacklisted'
				});
			}

			greylist.child(ip).once('value', function(snapshot) {
                        var exists = (snapshot.val() !== null);
                        
			if (exists){
				var greylistage = (Date.now() - snapshot.val());
				if (greylistage < 1000 * 60 * 60 * 24 * 7){
				console.log(ip,'->greylist');
                                return res.status(200).json({
                                        paydate: 0,
                                        address: address,
                                        amount: 0,
					message: 'you are greylisted',
					snapshot: snapshot.val(),
					duration: greylistage
				});
				}
                        }
			greylist.child(ip).set(Date.now());
			
			var queuetasks = queueRef.child('tasks');
			queuetasks.once('value', function(snap) {

				// first time
				if (!nextdrip) {
					nextdrip = getTimeStamp();
				}

				var queueitem = {
					paydate: nextdrip,
					address: address,
					amount: 1 * 1e18
				};

				var list = snap.val();

				if (list) {

					var length = Object.keys(list).length;

					if (length >= config.queuesize) {
						// queue is full - reject request
						return res.status(403).json({
							msg: 'queue is full'
						});
					}
				}

				queuetasks.push(queueitem);
				nextdrip += config.payoutfrequencyinsec;
				return res.status(200).json(queueitem);

			});

		});
});



	} else {
		return res.status(400).json({
			message: 'the address is invalid'
		});

	}



});

function donate(to, cb) {

	web3.eth.getGasPrice(function(err, result) {

		var gasPrice = result.toNumber(10);
		console.log('gasprice is ', gasPrice);

		var amount = config.payoutamountinether * 1e18;
		console.log("Transferring ", amount, "wei from", account, 'to', to);

		var options = {
			from: account,
			to: to,
			value: amount,
			gas: 314150,
			gasPrice: gasPrice,
		};
		console.log(options);
		web3.eth.sendTransaction(options, function(err, result) {

			if (err != null) {
				console.log(err);
				console.log("ERROR: Transaction didn't go through. See console.");
			} else {
				console.log("Transaction Successful!");
				console.log(result);
			}

			return cb(err, result);


		});
	});
}
