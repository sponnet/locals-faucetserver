var express = require('express');
var app = express();
var Web3 = require('web3');
var HookedWeb3Provider = require("hooked-web3-provider");
var lightwallet = require("eth-lightwallet");
var config = require('./config.json');
var Firebase = require('firebase');
var myRootRef = new Firebase(config.firebase.url);

var faucet_keystore = JSON.stringify(require("./wallet.json"));

var secretSeed = lightwallet.keystore.generateRandomSeed();

// check for valid Eth address
function isAddress(address) {
	return /^(0x)?[0-9a-f]{40}$/i.test(address);
};

// Add 0x to address 
function fixaddress(address) {
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

				var web3Provider = new HookedWeb3Provider({
					host: "http://109.123.70.141:8545",
					transaction_signer: keystore
				});

				web3 = new Web3();
				web3.setProvider(web3Provider);

				keystore.passwordProvider = function(callback) {
					callback(null, "testing");
				};

				console.log("Wallet initted addr=" + keystore.getAddresses()[0]);

				account = fixaddress(keystore.getAddresses()[0]);


				//console.log('Balance of ',account, 'is',etherbalance);


				// start webserver...
				app.listen(3000, function() {
					console.log('Example app listening on port 3000!');
				});

			});

		});
	}
});

// polymer app is served from here
app.use(express.static('static/locals-faucet/dist'));

// get current faucet info
app.get('/faucetinfo', function(req, res) {

	var etherbalance = parseFloat(web3.fromWei(web3.eth.getBalance(account).toNumber(), 'ether'));

	res.status(200).json({
		account: account,
		balance: etherbalance
	});
});

setInterval(function() {

	console.log('hup');
}, 1000);



// add our address to the donation queue
app.get('/donate/:address', function(req, res) {
	console.log('push');

	var address = fixaddress(req.params.address);

	if (isAddress(address)) {

		var queue = myRootRef.child("queue");
		queue.once('value', function(snap) {
			var list = snap.val();
			var length = 0;

			if (list) {

				console.log('list', list)
				length = Object.keys(list).length;
				console.log('length=', length);

				if (length > 5) {
					// queue is full
					return res.status(403).json({
						msg: 'queue is full'
					});
				}
			}

			var queueitem = {
				date: Math.floor(new Date().getTime() / 1000) + 60 * length,
				address: address,
				amount: 1 * 1e18
			}
			queue.push(queueitem);

			res.status(200).json(queueitem);


		});


	} else {
		res.status(400).json({
			message: 'the address is invalid'
		});

	}



});

function donate(to) {

	web3.eth.getGasPrice(function(err, result) {

		var gasPrice = result.toNumber(10);
		console.log('gasprice is ', gasPrice);


		//		var to = req.params.address;
		var amount = 1 * 1e18;
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


		});
	});
}