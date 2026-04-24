const express = require('express');
const router = express.Router();

router.get('/funnel-snapshot', (req, res) => {
    const funnelData = {
        funnel_data: {
            // Assuming you have a way to compute these metrics
            total_users: 1000,
            active_users: 800,
            conversion_rate: '80%'
