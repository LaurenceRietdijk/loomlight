const express = require("express");
const { Body } = require("node-fetch");
const router = express.Router();

//get
router.get("/", async (req, res) => {
    reply = { Body: "Success! Server responding!" };
    res.status(200).json(reply);
});

//post
router.post("/", async (req, res) => {
    reply = { Body: "post request accepted. This is just a testing endpoint" };
    res.status(200).json(reply);
});

module.exports = router;