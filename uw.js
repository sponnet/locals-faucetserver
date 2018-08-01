var lightwallet = require("eth-lightwallet");

if (!process.argv[3]) {
	console.log('Usage: ' + process.argv[1] + ' <walletfilename> <password>');
	console.log('Upgrades an old lightwallet with given password + serializes it again to the console');
	process.exit();
}
var oldSerialized = JSON.stringify(require(process.argv[2]));

lightwallet.upgrade.upgradeOldSerialized(oldSerialized,process.argv[3] , function(e,d){
	console.log(d);
});

