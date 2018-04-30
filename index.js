var express = require('express');
var app = express();
var cors = require('cors');
var Web3 = require('web3');
var HookedWeb3Provider = require("hooked-web3-provider");
var lightwallet = require("eth-lightwallet");
var config = require('./config.json');
const mkdirp = require('mkdirp');
const level = require('level');

mkdirp.sync(require('os').homedir() + '/.ethfaucet/queue');
mkdirp.sync(require('os').homedir() + '/.ethfaucet/exceptions');
const dbQueue = level(require('os').homedir() + '/.ethfaucet/queue');
const dbExceptions = level(require('os').homedir() + '/.ethfaucet/exceptions');
const greylistduration = 1000 * 60 * 60 * 24;

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


lightwallet.keystore.deriveKeyFromPassword("test", function(err, pwDerivedKey) {

	var keystore = new lightwallet.keystore.deserialize(faucet_keystore);

	console.log('connecting to ETH node: ', config.web3.host);

	var web3Provider = new HookedWeb3Provider({
		host: config.web3.host,
		transaction_signer: keystore
	});

	web3 = new Web3();
	web3.setProvider(web3Provider);

	keystore.passwordProvider = function(callback) {
		callback(null, "test");
	};

	console.log("Wallet initted addr=" + keystore.getAddresses()[0]);

	account = fixaddress(keystore.getAddresses()[0]);

	Promise.all([
		exceptionsLength(),
		queueLength()
	]).then(([lengths, length]) => {

		console.log('Exeptions count', JSON.stringify(lengths, null, 2));
		console.log('Current Queue length =', length);
		
		// start webserver...
		app.listen(config.httpport, function() {
			console.log('faucet listening on port ', config.httpport);
		});
	});

});


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
		queuename: 'queue'
	});
});


app.get('/blacklist/:address', function(req, res) {
	var address = fixaddress(req.params.address);
	if (isAddress(address)) {
		setException(address, 'blacklist').then(() => {
			res.status(200).json({
				msg: 'address added to blacklist'
			});

		});
	} else {
		return res.status(400).json({
			message: 'the address is invalid'
		});
	}
});

// queue monitor
setInterval(() => {
	iterateQueue();
	cleanupException();
}, config.payoutfrequencyinsec * 1000);

var lastIteration = 0;

function canDonateNow() {
	return new Promise((resolve, reject) => {
		const res = lastIteration < Date.now() - config.payoutfrequencyinsec * 1000;
		if (!res) {
			resolve(false);
		} else {
			queueLength().then((length) => {
				resolve(length == 0);
			});
		}
	});
}

function setDonatedNow() {
	lastIteration = Date.now();
	console.log('last donation:', lastIteration);
}

function doDonation(address) {
	return new Promise((resolve, reject) => {
		setDonatedNow();
		donate(address, (err, txhash) => {
			if (err) {
				resolve('0x0');
			} else {
				resolve(txhash);
			}
		})
	});
}

function queueLength() {
	return new Promise((resolve, reject) => {
		var count = 0;
		dbQueue.createReadStream()
			.on('data', function(data) {
				count++;
			})
			.on('error', function(err) {
				reject(err);
			})
			.on('end', function() {
				resolve(count);
			});
	});
}

function exceptionsLength() {
	return new Promise((resolve, reject) => {
		var lengths = {};
		dbExceptions.createReadStream({
				keys: true,
				values: true
			})
			.on('data', function(item) {
				var data = JSON.parse(item.value);
				if (!lengths[data.reason]) {
					lengths[data.reason] = 0;
				}
				lengths[data.reason]++;
			})
			.on('error', function(err) {
				reject(err);
			})
			.on('end', function() {
				resolve(lengths);
			});
	});
}

function enqueueRequest(address) {
	return new Promise((resolve, reject) => {
		const key = Date.now() + '-' + address;
		dbQueue.put(key, JSON.stringify({
			created: Date.now(),
			address: address,
		}), function(err) {
			if (err) {
				return reject(err);
			}
			queueLength().then((length) => {
				// calculated estimated payout date
				return resolve(Date.now() + length * config.payoutfrequencyinsec * 1000);
			})
		});
	});
}

function iterateQueue() {
	return new Promise((resolve, reject) => {
		// make sure faucet does not drip too fast.
		if (canDonateNow()) {
			var stream = dbQueue.createReadStream({
					keys: true,
					values: true
				})
				.on('data', async (item) => {
					//item = JSON.parse(item);
					console.log('item:', item);
					//debugger;
					stream.destroy();
					dbQueue.del(item.key, (err) => {
						if (err) {
							///
						}
						console.log('DONATE TO ', item.value);
						setDonatedNow();
						doDonation(item.value).then((txhash) => {
							console.log('sent ETH to ', item.value);
							return resolve();
						});
					});
				});
		} else {
			return resolve();
		}
	});
}

// lookup if there is an exception made for this address
function getException(address) {
	return new Promise((resolve, reject) => {
		dbExceptions.get(address, function(err, value) {
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
	return new Promise((resolve, reject) => {
		dbExceptions.put(address, JSON.stringify({
			created: Date.now(),
			reason: reason,
		}), function(err) {
			if (err) {
				return reject(err);
			}
			resolve();
		});
	});
}

// check if there are items in the exception queue that need to be cleaned up.
function cleanupException() {
	var stream = dbExceptions.createReadStream({
			keys: true,
			values: true
		})
		.on('data', async (item) => {
			const value = JSON.parse(item.value);
			if (value.reason === 'greylist') {
				if (value.created < Date.now() - greylistduration) {
					dbExceptions.del(item.key, (err) => {
						console.log('removed ', item.key, 'from greylist');
					});
				}
			}
		});
}

// try to add an address to the donation queue
app.get('/donate/:address', function(req, res) {
	var address = fixaddress(req.params.address);
	if (isAddress(address)) {
		const key = Date.now() + '-' + address;
		const val = {
			address: address
		};
		getException(address).then((exception) => {
			if (exception) {
				if (exception.reason === 'greylist') {
					return res.status(200).json({
						paydate: 0,
						address: address,
						amount: 0,
						message: 'you are greylisted',
						duration: exception.created + greylistduration - Date.now()
					});
				}
				if (exception.reason === 'blacklist') {
					return res.status(200).json({
						paydate: 0,
						address: address,
						amount: 0,
						message: 'you are blacklisted'
					});
				}
			} else {

				canDonateNow().then((canDonate) => {
					console.log('can donate now = ', canDonate);
					if (canDonate) {
						// donate right away
						doDonation(address).then((txhash) => {
							setException(address, 'greylist').then(() => {
								var reply = {
									address: address,
									txhash: txhash,
									amount: config.payoutamountinether * 1e18
								};
								return res.status(200).json(reply);
							});
						}).catch((e) => {
							return res.status(500).json({
								err: e.message
							});
						});
					} else {
						queueLength().then((length) => {
							if (length < config.queuesize) {
								// TODO queue item
								enqueueRequest(address).then((paydate) => {
									console.log('request queued');
									var queueitem = {
										paydate: paydate,
										address: address,
										amount: config.payoutamountinether * 1e18
									};
									return res.status(200).json(queueitem);
								});
							} else {
								return res.status(403).json({
									msg: 'queue is full'
								});
							}
						});
					}
				});
			}
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
