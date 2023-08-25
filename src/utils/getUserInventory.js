import { getShortDate } from 'utils/dateTime';
import steamApps from 'utils/static/steamApps';
import { getItemMarketLink } from 'utils/simpleUtils';

async function getSingleItemPrice(marketHashName) {
  const url = 'http://127.0.0.1:8000/api/price';
  const s = {
    name: marketHashName,
  };
  const promiseData = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', // Set the content type of the request
    },
    body: JSON.stringify(s), 
  });
  const data = await promiseData.json();
  setTimeout(() => {
    console.log('Delayed message after 3000ms');
  }, 3000);
  return data;
}
    
const getUserDOTAInventory = async (steamID) => new Promise((resolve, reject) => {
  chrome.storage.local.get(
    ['itemPricing', 'dotaPrice'],
    ({
      itemPricing, dotaPrice,
    }) => {
      const itemPrices = dotaPrice;
      const getRequest = new Request(`https://steamcommunity.com/profiles/${steamID}/inventory/json/${steamApps.DOTA2.appID}/2/?l=english`);
      fetch(getRequest).then((response) => {
        if (!response.ok) {
          reject(response.statusText);
          console.log(`Error code: ${response.status} Status: ${response.statusText}`);
        } else return response.json();
      }).then(async (body) => {
        if (body.success) {
          const fetchPromises = [];
          const items = body.rgDescriptions;
          const ids = body.rgInventory;

          const itemsPropertiesToReturn = [];
          let inventoryTotal = 0.0;
          const duplicates = {};

          // counts duplicates
          for (const asset of Object.values(ids)) {
            const assetID = asset.id;

            for (const item of Object.values(items)) {
              if (asset.classid === item.classid
                && asset.instanceid === item.instanceid) {
                const marketHashName = item.market_hash_name;
                if (duplicates[marketHashName] === undefined) {
                  const instances = [assetID];
                  duplicates[marketHashName] = {
                    num: 1,
                    instances,
                  };
                } else {
                  duplicates[marketHashName].num += 1;
                  duplicates[marketHashName].instances.push(assetID);
                }
              }
            }
          }
          for (const asset of Object.values(ids)) {
            const assetID = asset.id;
            const position = asset.pos;

            for (const item of Object.values(items)) {
              if (asset.classid === item.classid && asset.instanceid === item.instanceid) {
                const name = item.name;
                const marketHashName = item.market_hash_name;
                let tradability = 'Tradable';
                let tradabilityShort = 'T';
                const icon = item.icon_url;
                const owner = steamID;
                let price = null;
                const type = null;

                if (item.tradable === 0) {
                  tradability = item.cache_expiration;
                  tradabilityShort = getShortDate(tradability);
                }
                if (item.marketable === 0) {
                  tradability = 'Not Tradable';
                  tradabilityShort = '';
                }
                if (itemPricing && item.marketable !== 0) {
                  if (marketHashName in itemPrices) {
                    if (itemPrices[marketHashName].price !== undefined && itemPrices[marketHashName].price !== null
                      && itemPrices[marketHashName].price !== 0 && itemPrices[marketHashName].price !== 'null') { 
                      const d1 = new Date(itemPrices[marketHashName].update_date);
                      const d2 = new Date();
                      if ((Math.abs(d2 - d1) / 1000) > 86400) {
                        fetchPromises.push(getSingleItemPrice(marketHashName));
                        price = parseFloat(0);
                      } else {
                        price = itemPrices[marketHashName].price; 
                      }
                    } else {
                      fetchPromises.push(getSingleItemPrice(marketHashName));
                      price = parseFloat(0);
                    }
                  } else {
                    fetchPromises.push(getSingleItemPrice(marketHashName));
                    price = parseFloat(0);
                  }
                  inventoryTotal += parseFloat(price);
                } else price = parseFloat(0);

                itemsPropertiesToReturn.push({
                  name,
                  market_hash_name: marketHashName,
                  name_color: item.name_color,
                  marketlink: getItemMarketLink(steamApps.DOTA2.appID, marketHashName),
                  appid: item.appid,
                  contextid: '2',
                  classid: item.classid,
                  instanceid: item.instanceid,
                  assetid: assetID,
                  commodity: item.commodity,
                  position,
                  tradability,
                  tradabilityShort,
                  marketable: item.marketable,
                  iconURL: icon,
                  duplicates: duplicates[marketHashName],
                  owner,
                  price,
                  type,
                });
              }
            }
          }
          if (fetchPromises) {
            const fetchedPrices = await Promise.all(fetchPromises);
            const pricesDictionary = fetchedPrices.reduce((acc, priceObj) => {
              const itemName = Object.keys(priceObj)[0];
              acc[itemName] = priceObj[itemName];
              return acc;
            }, {});
            itemsPropertiesToReturn.forEach((i) => {
              if (i.name in pricesDictionary) {
                i.price = pricesDictionary[i.name].price;
                inventoryTotal += i.price;
              }
            });
          }
          const inventoryItems = itemsPropertiesToReturn.sort((a, b) => {
            return a.position - b.position;
          });
          resolve({
            items: inventoryItems,
            total: inventoryTotal,
          });
        } else if (body.Error === 'This profile is private.') {
          reject('inventory_private');
        } else {
          reject(body.Error);
        }
      }).catch((err) => {
        console.log(err);
        reject(err);
      });
    },
  );
});

// it's used to load other people's inventories by Steam now
// unused atm
const getUserDOTAInventoryAlternative = (steamID) => new Promise((resolve, reject) => {
  chrome.storage.local.get(
    ['itemPricing'],
    ({
      itemPricing,
    }) => {
      const getRequest = new Request(`https://steamcommunity.com/inventory/${steamID}/730/2/?l=english&count=2000`);
      fetch(getRequest).then((response) => {
        if (!response.ok) {
          reject(response.statusText);
          console.log(`Error code: ${response.status} Status: ${response.statusText}`);
        } else return response.json();
      }).then((body) => {
        if (body.success) {
          const assets = body.assets;
          const descriptions = body.descriptions;

          const itemsPropertiesToReturn = [];
          const inventoryTotal = 0.0;
          const duplicates = {};

          // counts duplicates
          assets.forEach((asset) => {
            const description = descriptions.filter((desc) => {
              if (asset.classid === desc.classid && asset.instanceid === desc.instanceid) {
                return desc;
              }
            })[0];

            const marketHashName = description.market_hash_name;
            if (duplicates[marketHashName] === undefined) {
              const instances = [asset.assetid];
              duplicates[marketHashName] = {
                num: 1,
                instances,
              };
            } else {
              duplicates[marketHashName].num += 1;
              duplicates[marketHashName].instances.push(asset.assetid);
            }
          });

          assets.forEach((asset) => {
            const item = descriptions.filter((desc) => {
              if (asset.classid === desc.classid && asset.instanceid === desc.instanceid) {
                return desc;
              }
            })[0];
            if (item) {
              const assetID = asset.assetid;

              const name = item.name;
              const marketHashName = item.market_hash_name;
              let tradability = 'Tradable';
              let tradabilityShort = 'T';
              const icon = item.icon_url;
              const owner = steamID;
              let price = null;
              const type = null;

              if (itemPricing) {
                price = null;
              } else price = { price: '', display: '' };

              if (item.tradable === 0) {
                tradability = 'Tradelocked';
                tradabilityShort = 'L';
              }
              if (item.marketable === 0) {
                tradability = 'Not Tradable';
                tradabilityShort = '';
              }

              itemsPropertiesToReturn.push({
                name,
                market_hash_name: marketHashName,
                name_color: item.name_color,
                marketlink: getItemMarketLink(steamApps.DOTA2.appID, marketHashName),
                appid: item.appid.toString(),
                contextid: '2',
                classid: item.classid,
                instanceid: item.instanceid,
                assetid: assetID,
                commodity: item.commodity,
                tradability,
                tradabilityShort,
                marketable: item.marketable,
                iconURL: icon,
                quality: null,
                duplicates: duplicates[marketHashName],
                owner,
                price,
                type,
              });
            } else {
              console.log('Description not found for asset:');
              console.log(asset);
            }
          });

          const sortedItems = itemsPropertiesToReturn.sort((a, b) => {
            return parseInt(b.assetid) - parseInt(a.assetid);
          });

          const itemsWithPosition = sortedItems.map((item, index) => {
            return {
              ...item,
              position: index,
            };
          });

          resolve({
            items: itemsWithPosition,
            total: inventoryTotal,
          });
          //   },
          // );
        } else if (body.Error === 'This profile is private.') {
          reject('inventory_private');
        } else {
          reject(body.Error);
        }
      }).catch((err) => {
        console.log(err);
        reject(err);
      });
    },
  );
});

const getOtherInventory = (appID, steamID) => new Promise((resolve, reject) => {
  const getRequest = new Request(`https://steamcommunity.com/profiles/${steamID}/inventory/json/${appID}/2/?l=english`);
  fetch(getRequest).then((response) => {
    if (!response.ok) {
      reject(response.statusText);
      console.log(`Error code: ${response.status} Status: ${response.statusText}`);
    } else return response.json();
  }).then((body) => {
    if (body.success) {
      const items = body.rgDescriptions;
      const ids = body.rgInventory;

      const itemsPropertiesToReturn = [];
      const duplicates = {};

      // counts duplicates
      for (const asset of Object.values(ids)) {
        const assetID = asset.id;
        for (const item of Object.values(items)) {
          if (asset.classid === item.classid
            && asset.instanceid === item.instanceid) {
            const marketHashName = item.market_hash_name;
            if (duplicates[marketHashName] === undefined) {
              const instances = [assetID];
              duplicates[marketHashName] = {
                num: 1,
                instances,
              };
            } else {
              duplicates[marketHashName].num += 1;
              duplicates[marketHashName].instances.push(assetID);
            }
          }
        }
      }
      for (const asset of Object.values(ids)) {
        const assetID = asset.id;
        const position = asset.pos;

        for (const item of Object.values(items)) {
          if (asset.classid === item.classid && asset.instanceid === item.instanceid) {
            const name = item.name;
            const marketHashName = item.market_hash_name;
            let tradability = 'Tradable';
            let tradabilityShort = 'T';
            const icon = item.icon_url;
            const owner = steamID;

            if (item.tradable === 0) {
              tradability = item.cache_expiration;
              tradabilityShort = getShortDate(tradability);
            }
            if (item.marketable === 0) {
              tradability = 'Not Tradable';
              tradabilityShort = '';
            }

            itemsPropertiesToReturn.push({
              name,
              market_hash_name: marketHashName,
              name_color: item.name_color,
              marketlink: getItemMarketLink(appID, marketHashName),
              appid: item.appid,
              contextid: '2',
              commodity: item.commodity,
              classid: item.classid,
              instanceid: item.instanceid,
              assetid: assetID,
              position,
              tradability,
              tradabilityShort,
              marketable: item.marketable,
              iconURL: icon,
              duplicates: duplicates[marketHashName],
              owner,
            });
          }
        }
      }
      const inventoryItems = itemsPropertiesToReturn.sort((a, b) => {
        return a.position - b.position;
      });
      resolve({ items: inventoryItems });
    } else if (body.Error === 'This profile is private.') {
      reject('inventory_private');
    } else {
      reject(body.Error);
    }
  }).catch((err) => {
    console.log(err);
    reject(err);
  });
});

export {
  getUserDOTAInventory, getUserDOTAInventoryAlternative, getOtherInventory, getSingleItemPrice,
};
