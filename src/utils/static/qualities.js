import rarities from 'utils/static/rarities';

const qualities = {
  unknown: {
    name: 'unknown',
    color: null,
    backgroundcolor: null,
  },
  common: {
    name: rarities.common.name,
    color: '#FFFFFF',
    backgroundcolor: '#b0c3d9',
  },
  uncommon: {
    name: rarities.uncommon.name,
    color: '#5e98d9',
    backgroundcolor: '#5e98d9',
  },
  rare: {
    name: rarities.rare.name,
    color: '#4b69ff',
    backgroundcolor: '#4b69ff',
  },
  mythical: {
    name: rarities.mythical.name,
    color: '#8847ff',
    backgroundcolor: '#8847ff',
  },
  legendary: {
    name: rarities.legendary.name,
    color: '#d32ce6',
    backgroundcolor: '#d32ce6',
  },
  immortal: {
    name: rarities.immortal.name,
    color: '#4b69ff',
    backgroundcolor: '#e4ae39',
  },
  arcana: {
    name: rarities.arcana.name,
    color: '#8847ff',
    backgroundcolor: '#ADE55C',
  },
  seasonal: {
    name: rarities.seasonal.name,
    color: '#d32ce6',
    backgroundcolor: '#fff34f',
  },
};

export default qualities;
