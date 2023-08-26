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
    backgroundcolor: '#7e7e7e',
  },
  uncommon: {
    name: rarities.uncommon.name,
    color: '#5e98d9',
    backgroundcolor: '#3d6896',
  },
  rare: {
    name: rarities.rare.name,
    color: '#4b69ff',
    backgroundcolor: '#414e9c',
  },
  mythical: {
    name: rarities.mythical.name,
    color: '#8847ff',
    backgroundcolor: '#50248e',
  },
  legendary: {
    name: rarities.legendary.name,
    color: '#d32ce6',
    backgroundcolor: '#6c297f',
  },
  immortal: {
    name: rarities.immortal.name,
    color: '#4b69ff',
    backgroundcolor: '#414e9c',
  },
  arcana: {
    name: rarities.arcana.name,
    color: '#8847ff',
    backgroundcolor: '#50248e',
  },
  seasonal: {
    name: rarities.seasonal.name,
    color: '#d32ce6',
    backgroundcolor: '#6c297f',
  },
};

export default qualities;
