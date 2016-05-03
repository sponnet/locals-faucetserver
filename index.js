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
	address = address.replace(' ','');

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
var donationqueue = {};

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

// get current faucet info
app.get('/faucetinfo', function(req, res) {
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
	});
});



// Creates the Queue
var options = {
	//specId: 'faucet',
	numWorkers: 1
};

var queueRef = myRootRef.child("queue");

var nextpayout = getTimeStamp();

var queue = new Queue(queueRef, options, function(data, progress, resolve, reject) {
	// Read and process task data
	console.log('queue item is here...')
	console.log(data);

	if (nextpayout - getTimeStamp() > 0) {
		// need to wait 
		console.log('next payout in ', nextpayout - getTimeStamp(), 'sec');

		// Finish the task
		setTimeout(function() {
			console.log('resolved');
			resolve();

			donate(data.address, function(err, result) {
				console.log('TXhash=', result);
			});
			nextpayout = getTimeStamp() + config.payoutfrequencyinsec;
			console.log('next payout', nextpayout);

		}, (nextpayout - getTimeStamp()) * 1000);

	} else {

		console.log('next payout is now');

		resolve();
		donate(data.address, function(err, result) {
			console.log('TXhash=', result);
		});
		nextpayout = getTimeStamp() + config.payoutfrequencyinsec;
		console.log('next payout', nextpayout);
	}
});



// add our address to the donation queue
app.get('/donate/:address', function(req, res) {
	console.log('push');

	var address = fixaddress(req.params.address);

	if (isAddress(address)) {

		var queuetasks = myRootRef.child("queue").child('tasks');
		queuetasks.once('value', function(snap) {
			var list = snap.val();
			var length = 0;

			var queueitem = {
				paydate: Math.floor(new Date().getTime() / 1000) + length * config.payoutfrequencyinsec,
				address: address,
				amount: 1 * 1e18
			};

			if (list) {

				length = Object.keys(list).length;
				console.log('queuelength=', length);

				if (length == 0) {
					// this should never happen...
					return res.status(500).json({
						error: "Call the plumber"
					});
				} else if (length >= config.queuesize) {
					// queue is full - reject request
					return res.status(403).json({
						msg: 'queue is full'
					});
				} else {
					// queue is not full - enqueue the item
					res.status(200).json(queueitem);
					queuetasks.push(queueitem);
				}
			} else {
				// if queue is empty - pay immediately - and return the TXhash. 
				// But also save it to the queue
				// so the next payout needs to wait for the next interval.
				donate(queueitem.address, function(err, result) {
					console.log('TXhash=', result);
					queueitem.txhash = result;
					queuetasks.push(queueitem);
					res.status(200).json(queueitem);
				});
			}
		});
	} else {
		res.status(400).json({
			message: 'the address is invalid'
		});

	}



});

function donate(to, cb) {

	web3.eth.getGasPrice(function(err, result) {

		var gasPrice = result.toNumber(10);
		console.log('gasprice is ', gasPrice);


		//		var to = req.params.address;
		var amount = config.payoutamountinether * 1e18;
		console.log("Transferring ", amount, "wei from", account, 'to', to);

		var options = {
			from: account,
			to: to,
			value: amount,
			gas: 314150,
			gasPrice: gasPrice,
			nonce: Math.floor(Math.random(999999)) + new Date().getTime(),
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