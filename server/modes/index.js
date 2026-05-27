'use strict';

// -------------------------------------------------------------------
// Mode registry
// All 11 mode strategies. Keys match room.settings.mode values.
// -------------------------------------------------------------------

module.exports = {
  classic:      require('./classic'),
  knockoff:     require('./knockoff'),
  solo:         require('./solo'),
  story:        require('./story'),
  animation:    require('./animation'),
  coop:         require('./coop'),
  masterpiece:  require('./masterpiece'),
  missingpiece: require('./missingpiece'),
  background:   require('./background'),
  secret:       require('./secret'),
  // speedrun is NOT a mode — it is a settings preset applied by the Host UI
};
