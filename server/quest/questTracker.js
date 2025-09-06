const EventBus = require('../services/eventBus');
const QuestDAL = require('../dal/questDAL');

/**
 * QuestTracker: lightweight framework for handling quest progress updates.
 * MVP implements only the "Clear" quest type progress on character kills.
 * Other quest types will be added here later.
 */
const QuestTracker = {
  /**
   * Handle a character being killed; update relevant quest progress.
   * @param {string} world_id
   * @param {Object} characterDoc - Updated character document (post-kill)
   */
  async onCharacterKilled(world_id, characterDoc) {
    try {
      if (!characterDoc || !characterDoc.location || !characterDoc.location.locale) return;
      const locale_id = characterDoc.location.locale;

      // Recompute enemies remaining for accepted Clear quests targeting this locale.
      const affected = await QuestDAL.recomputeClearQuestsForLocale(world_id, locale_id);

      for (const q of affected) {
        // Emit granular progress event
        EventBus.emit('quest:progress', {
          world_id,
          quest_id: String(q._id),
          acceptedBy: q.acceptedBy ? String(q.acceptedBy) : null,
          questType: q.questType,
          title: q.title,
          state: q.state,
          data: {
            enemiesRemaining: q.enemiesRemaining || 0,
            targetLocale: q.targetLocale ? String(q.targetLocale) : null,
          },
        });

        // Emit state change event when completed
        if (q.state === 'completed') {
          EventBus.emit('quest:state', {
            world_id,
            quest_id: String(q._id),
            acceptedBy: q.acceptedBy ? String(q.acceptedBy) : null,
            questType: q.questType,
            title: q.title,
            state: q.state,
          });
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[QuestTracker] onCharacterKilled error', e);
    }
  },

  // Placeholder: item acquired
  // async onItemAcquired(world_id, playerCharacterId, itemId, quantity) {},

  // Placeholder: item delivered
  // async onItemDelivered(world_id, playerCharacterId, itemId, recipientId) {},

  // Placeholder: locale explored
  // async onLocaleExplored(world_id, playerCharacterId, localeId) {},
  // Placeholder: character moved locales (recompute both source and destination)
  // async onCharacterMoved(world_id, characterDoc, fromLocaleId, toLocaleId) {},
};

module.exports = QuestTracker;
