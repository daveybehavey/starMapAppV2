const express = require('express');
const router = express.Router();

// Mock data for the weekly funnel snapshot
const weeklyFunnelSnapshot = {
    sessions: 1000,
    conversions: 150,
    paidTransactions: 120
};

// Endpoint to get the weekly funnel snapshot
router.get('/api/ops/weekly-funnel-snapshot', (req, res) => {
    res.status(200).json(weeklyFunnelSnapshot);
});

