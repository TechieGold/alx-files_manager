// index.js
const express = require('express');
const AppController = require('../controllers/AppController.js');

const router = express.Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

module.exports = router;