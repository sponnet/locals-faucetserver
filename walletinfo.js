var lightwallet = require('eth-lightwallet');
var fs = require('fs');

if (!process.argv[2] || !process.argv[3]) {
	console.log('Usage: ' + process.argv[1] + ' <walletfile> <password>');
	console.log('dumps your lightwallet file\s keys using the password you provide');
	process.exit();
}

var walletJSON = fs.readFileSync('./' + process.argv[2],{ encoding: 'utf8' });

var secretSeed = lightwallet.keystore.generateRandomSeed();
lightwallet.keystore.deriveKeyFromPassword(process.argv[3], (err, pwDerivedKey) => {
	var keystore = new lightwallet.keystore.deserialize(walletJSON);
	var pk = keystore.exportPrivateKey(keystore.getAddresses()[0], pwDerivedKey);
	console.log('public key=',keystore.getAddresses()[0]);
	console.log('private key=',pk);
});
