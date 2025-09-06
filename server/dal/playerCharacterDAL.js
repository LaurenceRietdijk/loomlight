const PlayerCharacter = require("../models/playerCharacter");

class PlayerCharacterDAL {
  static async getAll() {
    return await PlayerCharacter.find().exec();
  }

  static async create(name) {
    const pc = new PlayerCharacter({ name });
    return await pc.save();
  }

  static async delete(id) {
    return await PlayerCharacter.findByIdAndDelete(id).exec();
  }
}

module.exports = PlayerCharacterDAL;

