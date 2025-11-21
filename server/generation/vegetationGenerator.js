const gpt = require("../services/gptService");
const VegetationDAL = require("../dal/vegetationDAL");

class VegetationGenerator {
  /**
   * Generate a single vegetation definition, optionally scoped by world context.
   * Texture generation is deferred to the PixelLab image scheduler.
   * @param {Object|null} world
   * @param {Object} options - { preferredName?, preferredType? }
   * @returns {Promise<Object>}
   */
  static async generateVegetation(world = null, options = {}) {
    if (world && world.name) {
      console.log(`Generating 1 vegetation with context from world ${world.name}...`);
    } else {
      console.log("Generating 1 vegetation (no world context)...");
    }

    const worldDescription = world
      ? world.worldBuilding || world.description || "No description provided."
      : "";

    const preferredName = options && typeof options === 'object' ? String(options.preferredName || '').trim() : '';
    const preferredType = options && typeof options === 'object' ? String(options.preferredType || '').trim() : '';

    const validTypes = ['flower', 'grass', 'bush', 'tree', 'fungus', 'moss', 'lichen', 'briar', 'lily'];
    const typeConstraint = preferredType && validTypes.includes(preferredType) ? preferredType : '';

    let system = "You generate a SINGLE vegetation/plant type as compact JSON. Output ONLY a JSON object with exactly three string fields: name, description, and type. The 'type' field must be one of: flower, grass, bush, tree, fungus, moss, lichen, briar, lily. No arrays, no extra fields, no prose. The vegetation should be a natural plant suitable for outdoor environments.";
    
    if (preferredName) {
      system += " The 'name' MUST be exactly the provided preferredName.";
    }
    if (typeConstraint) {
      system += ` The 'type' MUST be exactly: ${typeConstraint}`;
    }

    let user = "";
    if (world) {
      user = `Create one natural vegetation/plant for the world "${world.name}". Return only {name, description, type}.\n\nWorld context:\n${worldDescription}`;
    } else {
      user = `Create one natural vegetation/plant. Return only {name, description, type}.`;
    }

    if (preferredName) {
      user += `\n\nThe vegetation name MUST be exactly: ${preferredName}`;
    }
    if (typeConstraint) {
      user += `\n\nThe vegetation type MUST be exactly: ${typeConstraint}`;
    }

    const vegetationInfo = await gpt.chatJSONPrompt(system, user, { max_tokens: 512, temperature: 0.8 });

    if (!vegetationInfo || typeof vegetationInfo !== "object") {
      throw new Error("GPT did not return a vegetation object");
    }

    const name = (vegetationInfo.name || (preferredName || "Unnamed Vegetation")).toString();
    const description = (vegetationInfo.description || "").toString();
    let type = (vegetationInfo.type || typeConstraint || "grass").toString().toLowerCase();
    
    // Validate type
    if (!validTypes.includes(type)) {
      console.warn(`Invalid vegetation type "${type}", defaulting to "grass"`);
      type = "grass";
    }

    const vegetationData = { name, description, type };
    const inserted = await VegetationDAL.insertVegetation(vegetationData);

    console.log("Vegetation successfully generated (texture pending scheduler).");
    return inserted;
  }
}

module.exports = VegetationGenerator;
