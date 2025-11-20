// api/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { login, registrar } = require('../controllers/auth.controller');

router.post('/login', login);         // /api/auth/login
router.post('/registro', registrar);  // /api/auth/registro

module.exports = router;
