const mongoose = require("mongoose");
const config = require("config");

const db = (config.get("mongo.useLocal")
  ? config.get("mongo.localURI")
  : config.get("mongo.remoteURI")) + "/Worlds";

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
