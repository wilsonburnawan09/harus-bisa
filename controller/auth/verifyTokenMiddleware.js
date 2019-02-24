var jwt = require('jsonwebtoken');
var config = require('../../config');
function verifyToken(req, res, next) {
	if (!req.headers['authorization']) {
		return res.status(403).send({ message: 'No authorization header provided.'});
	}
  	var token = req.headers['authorization'].split(" ")[1];
	if (!token) return res.status(403).send({ auth: false, message: 'No token provided.' });
  	jwt.verify(token, config.secret, function(err, decoded) {
    	if (err) return res.status(500).send({ auth: false, message: 'Failed to authenticate token.' });
		req.userId = decoded.id;
		req.first_name = decoded.first_name;
		req.last_name = decoded.last_name;
		req.email = decoded.email;
		req.role = decoded.role;
		req.school = decoded.school;
		next();
	});
}
module.exports = verifyToken;