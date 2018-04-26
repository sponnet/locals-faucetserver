var lightwallet = require("eth-lightwallet");

if (!process.argv[2]) {
	console.log('Usage: ' + process.argv[1] + ' <password>');
	console.log('Creates a new lightwallet with given password');
	process.exit();
}

var secretSeed = lightwallet.keystore.generateRandomSeed();
lightwallet.keystore.deriveKeyFromPassword(process.argv[2], (err, pwDerivedKey) => {
	var keystore = new lightwallet.keystore(secretSeed, pwDerivedKey);
	keystore.generateNewAddress(pwDerivedKey, 1);
	console.log(keystore.serialize());
});
