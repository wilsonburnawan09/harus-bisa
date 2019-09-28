var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../../model/User');
var Token = require('../../model/Token');
var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');
var config = require('../../config');
var gmail = config.email;
var gmail_password = config.email_password;
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var mg = require('nodemailer-mailgun-transport');

router.post('/signup', function(req, res) {
	var first_name = "";
  	var last_name = "";
  	var email = "";
  	var school = "";
  	var role = "";
  	var hashed_password = "";
  	if(req.body.first_name) {first_name = req.body.first_name.trim();}
  	if(req.body.last_name) {last_name = req.body.last_name.trim();}
  	if(!req.body.email) {
		// return res.status(500).send({ message: "Email not provided."});
		return res.status(500).send({ message: "Email tidak diberikan."});
  	} else {
    	email = req.body.email.trim();
  	}
  	if (req.body.school) {school = req.body.school.trim();}
  	if (!req.body.role) {
		// return res.status(500).send({ message: "Role not provided"});
		return res.status(500).send({ message: "Posisi tidak diberikan."});
  	} else {
    	role = req.body.role.trim();
  	}
  	if (!req.body.password) {
		// return res.status(500).send({ message: "Password not provided."});
		return res.status(500).send({ message: "Kata sandi tidak diberikan."});
  	} else {
    	hashed_password = bcrypt.hashSync(req.body.password, 8);
  	}
    
  	User.findOne({ email: email}, function(err, user){
    	if(user) {
			  // return res.status(500).send({ auth: false, token: null, message: "Email " + email + " already exists."});
			  return res.status(500).send({ auth: false, token: null, message: "Email " + email + " sudah pernah terdaftar."});
    	} else {
			User.create({
				first_name: first_name,
				last_name: last_name,
				email : email,
				school: school,
				role: role,
				password : hashed_password
			},
			function (err, user) {
				// if (err) return res.status(500).send( {message: "There was a problem registering the user."});
				if (err) return res.status(500).send({ message: "Terjadi masalah dalam mendaftarkan pengguna aplikasi."});
			// create a token
				var payload = {
					id: user._id,
					first_name: user.first_name,
					last_name: user.last_name,
					email: user.email,
					role: user.role,
					school: user.school
				}
				var login_token = jwt.sign(payload, config.secret, {
					expiresIn: 86400 // expires in 24 hours
				});
				
				var random = crypto.randomBytes(16).toString('hex');

				var verification_token = new Token({ email: user.email, random_string: random });
				verification_token.save(function (err) {
					// if (err) { return res.status(500).send({ message: "There was a problem creating the verification token." }); }
					if (err) { return res.status(500).send({ message: "Terjadi masalah dalam membuat token verifikasi." + err}); }
					
					var auth = {
						auth: {
						  api_key: '',
						  domain: ''
						}
					  }
					   
					  var nodemailerMailgun = nodemailer.createTransport(mg(auth));
					   
					  nodemailerMailgun.sendMail({
						from: gmail,
						to: user.email,
						subject: 'Harus Bisa - verifikasi email',
						//You can use "text:" to send plain-text content. It's oldschool!
						text: 'Hello,\n\n' + 'Please verify your account by clicking the link: \nhttps:\/\/' + 'api.harusbisa.net' + '\/api\/confirmation\/' + random + '.\n'
					  }, function (err, info) {
						if (err) {
							// return res.status(500).send({ message: "There was a problem sending the verification email." + err});
						// }
						// else {
							res.status(200).send({ auth: true, token: login_token, message: "Email verifikasi telah dikirim." });
						}
					  });
				});
      		}); 
    	}
  	});
});

router.get('/confirmation/:token', function(req,res) {
	Token.findOne({ random_string: req.params.token }, function (err, token) {
        if (!token) return res.status(400).send({ message: 'We were unable to find a valid token. Your token my have expired.' });
 
        // If we found a token, find a matching user
        User.findOne({ email: token.email}, function (err, user) {
            if (!user) return res.status(400).send({ msg: 'We were unable to find a user for this token.' });
		  
            // Verify and save the user
            user.is_verified = true;
            user.save(function (err) {
                if (err) { return res.status(500).send({ message: "There was a problem verifying the user" }); }
				res.status(301).redirect("https://www.harusbisa.net/login")
				// res.status(200).send("https://www.harusbisa.net/courses")
            });
        });
    });
});

router.post('/resend', function(req, res){
	User.findOne({ email: req.body.email }, function (err, user) {
		// if (!user) return res.status(400).send({ message: 'We were unable to find a user with that email.' });
		if (!user) return res.status(400).send({ message: 'Pengguna aplikasi dengan email '+ req.body.email + ' tidak dapat ditemukan.' });
		// if (user.is_verified) return res.status(400).send({ message: 'This account has already been verified. Please log in.' });
		if (user.is_verified) return res.status(400).send({ message: 'Pengguna aplikasi sudah pernah di verifikasi. Tolong login' });
 
		var payload = {
			id: user._id,
			first_name: user.first_name,
			last_name: user.last_name,
			email: user.email,
			role: user.role,
			school: user.school
		}
		var login_token = jwt.sign(payload, config.secret, {
			expiresIn: 86400 // expires in 24 hours
		});
		
		var random = crypto.randomBytes(16).toString('hex');

		var verification_token = new Token({ email: user.email, random_string: random });
		verification_token.save(function (err) {
			// if (err) { return res.status(500).send({ message: "There was a problem creating the verification token." }); }
			if (err) { return res.status(500).send({ message: "Terjadi masalah dalam membuat token verifikasi." + err}); }
			
			var smtpTransport = nodemailer.createTransport({
				service: "Gmail",
				auth: {
					user: gmail,
					pass: gmail_password
				}
			});
			var mailOptions = { from: gmail, to: user.email, subject: 'Account Verification Token', text: 'Hello,\n\n' + 'Please verify your account by clicking the link: \nhttps:\/\/' + 'api.harusbisa.net' + '\/api\/confirmation\/' + random + '.\n' };
			smtpTransport.sendMail(mailOptions, function (err) {
				if (err) { return res.status(500).send({ message: "There was a problem sending the verification email"}); }
				// res.status(200).send({ auth: true, token: token, message: "Verification email has been sent." });
				res.status(200).send({ auth: true, token: login_token, message: "Email verifikasi telah dikirim." });
			});
		});
 
    });
});



router.post('/login', function(req, res) {
  	var email = ""
  	if(!req.body.email || !req.body.password) {
		// return res.status(401).send({ message: "Password or email is not provied."});
		return res.status(401).send({ message: "Email atau kata sandi tidak diberikan."});
  	} else {
    	email = req.body.email.trim();
  	}
  	User.findOne({ email: email }, function (err, user) {
		// if (err) return res.status(500).send({ auth: false, token: null, message: "There was a problem finding the user."});
		if (err) return res.status(500).send({ auth: false, token: null, message: "Terjadi masalah dalam mencari pengguna aplikasi."});
		// if (!user) return res.status(404).send({ auth: false, token: null, message: "User " + email + " not found."});
		if (!user) return res.status(404).send({ auth: false, token: null, message: "Email atau password yang diberikan salah. Silahkan dicoba lagi."});
		
    	var passwordIsValid = bcrypt.compareSync(req.body.password, user.password);
		// if (!passwordIsValid) return res.status(401).send({ auth: false, token: null, message: "Wrong password."});
		if (!passwordIsValid) return res.status(401).send({ auth: false, token: null, message: "Email atau password yang diberikan salah. Silahkan dicoba lagi."});
		// if (!user.is_verified) return res.status(401).send({ message: 'Your account has not been verified.', auth: false, token: null });
		// if (!user.is_verified) return res.status(401).send({ message: 'Akun ini belum di verifikasi melalui email.', auth: false, token: null });
    
    	var payload = {
			id: user._id,
			first_name: user.first_name,
			last_name: user.last_name,
			email: user.email,
			role: user.role,
			school: user.school
    	}
    	var token = jwt.sign(payload, config.secret, {
      		expiresIn: 86400 // expires in 24 hours
    	});
		
		// res.status(200).send({ auth: true, token: token, message: "Login is successful." });
		res.status(200).send({ auth: true, token: token, message: "Login telah berhasil." });
  	});
});

router.get('/logout', function(req, res) {
	//   res.status(200).send({ auth: false, token: null, message: "Logout is successful." });
	  res.status(200).send({ auth: false, token: null, message: "Logout telah berhasil." });
});

module.exports = router;