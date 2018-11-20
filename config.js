const env = process.env.NODE_ENV || 'development';
const config = {
  development: {
    irc: {
      server: 'irc.elisa.fi',
      nick: 'VisionBot',
      options: {
        channels: ['#visionbot'],
        port: 6667
      }
    },
    safeSearchTolerance: {
      adult: 'POSSIBLE',
      spoof: '',
      medical: 'POSSIBLE',
      violence: 'VERY_LIKELY'
    }
  },
  prod_ircnet: {
    irc: {
      server: 'irc.inet.fi',
      nick: 'VisionBot',
      options: {
        channels: ['#visionbot'],
        port: 6667
      }
    },
    safeSearchTolerance: {
      adult: 'POSSIBLE',
      spoof: '',
      medical: 'POSSIBLE',
      violence: 'VERY_LIKELY'
    }
  },
  prod_ihmenet: {
    irc: {
      server: 'irc.ihme.org',
      nick: 'VisionBot',
      options: {
        channels: ['#ihme'],
        port: 6667
      }
    },
    safeSearchTolerance: {
      adult: 'POSSIBLE',
      spoof: '',
      medical: 'POSSIBLE',
      violence: 'VERY_LIKELY'
    }
  }
};
module.exports = config[env];