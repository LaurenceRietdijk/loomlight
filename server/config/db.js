const mongoose = require("mongoose");
const config = require("config");

const db = config.get("DBURI") + "/Worlds";

const connectDB = async () => {
  try {
    await mongoose.connect(db, {});

    console.log("mongoDB connected");
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

module.exports = connectDB;
