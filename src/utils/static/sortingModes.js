const sortingModes = {
  default: {
    key: 'default',
    name: 'Default (position last to first)',
  },
  reverse: {
    key: 'reverse',
    name: 'Reverse (position first to last)',
  },
  price_desc: {
    key: 'price_desc',
    name: 'Price (expensive to cheap)',
  },
  price_asc: {
    key: 'price_asc',
    name: 'Price (cheap to expensive)',
  },
  name_asc: {
    key: 'name_asc',
    name: 'Alphabetical (a to z)',
  },
  name_desc: {
    key: 'name_desc',
    name: 'Alphabetical (z to a)',
  },
  tradability_desc: {
    key: 'tradability_desc',
    name: 'Tradability (untradable to tradable)',
  },
  tradability_asc: {
    key: 'tradability_asc',
    name: 'Tradability (tradable to untradable)',
  },
};

const listingsSortingModes = {
  default: {
    key: 'default',
    name: 'Default Steam Order',
  },
  price_asc: sortingModes.price_asc,
  price_desc: sortingModes.price_desc,
};

export { sortingModes, listingsSortingModes };
