import DOMPurify from 'dompurify';
import { getSingleItemPrice } from 'utils/getUserInventory';
import {
  addPageControlEventListeners, addPriceIndicator, copyToClipboard, addUpdatedRibbon, updateLoggedInUserName,
  logExtensionPresence, repositionNameTagIcons,
  updateLoggedInUserInfo, reloadPageOnExtensionReload, isSIHActive, getActivePage,
  addSearchListener, makeItemColorful, getQuality,
}
  from 'utils/utilsModular';
import {
  getItemMarketLink,
} from 'utils/simpleUtils';
import { getShortDate } from 'utils/dateTime';
import {
  getPriceOverview, getPriceAfterFees, prettyPrintPrice, addRealTimePriceToPage,
  priceQueue, workOnPriceQueue, getSteamWalletCurrency,
  updateWalletCurrency, getHighestBuyOrder, getLowestListingPrice,
}
  from 'utils/pricing';
import { getItemByIDs, getIDsFromElement } from 'utils/itemsToElementsToItems';
import { listItem } from 'utils/market';
import { sortingModes } from 'utils/static/sortingModes';
import doTheSorting from 'utils/sorting';
import { overridePopulateActions } from 'utils/steamOverriding';
import { injectScript } from 'utils/injection';
import { getUserSteamID } from 'utils/steamID';
import steamApps from 'utils/static/steamApps';

const pricePercentage = 100; // can be changed, for easier discount calculation
let items = [];
let inventoryTotal = 0.0;
let showContrastingLook = true;
let showDuplicates = true;
// variables for the countdown recursive logic
let countingDown = false;
let countDownID = '';

const lowerModule = `<a class="lowerModule">
    <div class="descriptor tradability tradabilityDiv"></div>
    <div class="descriptor countdown"></div>
</a>`;

const tradable = '<span class="tradable">Tradable</span>';
const notTradable = '<span class="not_tradable">Not Tradable</span>';
const tradeLocked = '<span class="not_tradable">Tradelocked</span>';

const getInventoryOwnerID = () => {
  const inventoryOwnerIDScript = 'document.querySelector(\'body\').setAttribute(\'inventoryOwnerID\', UserYou.GetSteamId());';
  return injectScript(inventoryOwnerIDScript, true, 'inventoryOwnerID', 'inventoryOwnerID');
};

// gets the asset id of the item that is currently selected
// const getAssetIDofActive = () => {
//   return getAssetIDOfElement(document.querySelector('.activeInfo'));
// };

const getIDsOfActiveItem = () => {
  return getIDsFromElement(document.querySelector('.activeInfo'), 'inventory');
};

const getDefaultContextID = (appID) => {
  // 2 is the default context for standard games
  // 6 is the community context for steam
  return appID === steamApps.STEAM.appID ? '6' : '2';
};

// works in inventory and profile pages
const isOwnInventory = () => {
  return getUserSteamID() === getInventoryOwnerID();
};

const getActiveInventoryAppID = () => {
  const activeTab = document.querySelector('.games_list_tab.active');
  if (activeTab) return activeTab.getAttribute('href').split('#')[1];
  return null;
};

const gotToNextInventoryPage = () => {
  const nextPageButton = document.getElementById('pagebtn_next');
  if (nextPageButton !== null && !nextPageButton.classList.contains('disabled')) nextPageButton.click();
};

const goToPreviousInventoryPage = () => {
  const previPageButton = document.getElementById('pagebtn_previous');
  if (previPageButton !== null && !previPageButton.classList.contains('disabled')) previPageButton.click();
};

const cleanUpElements = () => {
  document.querySelectorAll(
    '.lowerModule, .inTradesInfoModule, .otherExteriors, .custom_name,.startingAtVolume,.marketActionInstantSell, .marketActionQuickSell, .listingError',
  ).forEach((element) => {
    element.remove();
  });
};

const countDown = (dateToCountDownTo) => {
  if (!countingDown) {
    countingDown = true;
    countDownID = setInterval(() => {
      document.querySelectorAll('.countdown').forEach((countdown) => {
        const now = new Date().getTime();
        const distance = new Date(dateToCountDownTo) - now;
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        countdown.innerText = `${days}d ${hours}h ${minutes}m ${seconds}s remains`;

        if (distance < 0) {
          clearInterval(countDownID);
          countdown.classList.add('hidden');
          document.querySelectorAll('.tradabilityDiv').forEach((tradabilityDiv) => {
            tradabilityDiv.innerText = 'Tradable';
            tradabilityDiv.classList.add('tradable');
          });
        }
      });
    }, 1000);
  } else {
    clearInterval(countDownID);
    countingDown = false;
    countDown(dateToCountDownTo);
  }
};

const getItemInfoFromPage = (appID, contextID) => {
  const getItemsScript = `
        inventory = UserYou.getInventory(${appID},${contextID});
        trimmedAssets = [];
                
        for (const asset of Object.values(inventory.m_rgAssets)) {
            if (asset.hasOwnProperty('appid')) {
              trimmedAssets.push({
                  amount: asset.amount,
                  assetid: asset.assetid,
                  classid: asset.classid,
                  contextid: asset.contextid,
                  instanceid: asset.instanceid,
                  description: asset.description,
                  ...asset.description,
                  appid: asset.appid.toString(),
              });
            }
        }
        document.querySelector('body').setAttribute('inventoryInfo', JSON.stringify(trimmedAssets));`;
  return JSON.parse(injectScript(getItemsScript, true, 'getInventory', 'inventoryInfo'));
};

const getDOTAInventoryDataFromPage = async () => new Promise((resolve) => {
  chrome.storage.local.get(
    ['itemPricing', 'dotaPrice'],
    async ({
      itemPricing, dotaPrice,
    }) => {
      const itemPrices = dotaPrice;
      const itemsFromPage = getItemInfoFromPage(steamApps.DOTA2.appID, '2').sort((a, b) => {
        return parseInt(b.assetid) - parseInt(a.assetid);
      });
      const fetchPromises = [];
      const itemsPropertiesToReturn = [];
      const duplicates = {};
      const owner = getInventoryOwnerID();
      // counts duplicates
      itemsFromPage.forEach((item) => {
        const marketHashName = item.description.market_hash_name;
        if (duplicates[marketHashName] === undefined) {
          const instances = [item.assetid];
          duplicates[marketHashName] = {
            num: 1,
            instances,
          };
        } else {
          duplicates[marketHashName].num += 1;
          duplicates[marketHashName].instances.push(item.assetid);
        }
      });

      inventoryTotal = 0;
      itemsFromPage.forEach((item, index) => {
        const assetID = item.assetid;
        const name = item.description.name;
        const marketHashName = item.description.market_hash_name;
        let tradability = 'Tradable';
        let tradabilityShort = 'T';
        const icon = item.description.icon_url;
        let price = null;
        const type = null;

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

        if (item.description.tradable === 0) {
          tradability = 'Tradelocked';
          tradabilityShort = 'L';
        }
        if (item.description.marketable === 0) {
          tradability = 'Not Tradable';
          tradabilityShort = '';
        }

        itemsPropertiesToReturn.push({
          description: item.description,
          name,
          market_hash_name: marketHashName,
          name_color: item.description.name_color,
          marketlink: getItemMarketLink(steamApps.DOTA2.appID, marketHashName),
          appid: item.appid.toString(),
          contextid: '2',
          classid: item.classid,
          instanceid: item.instanceid,
          assetid: assetID,
          commodity: item.description.commodity,
          quality: getQuality(item.tags),
          tradability,
          tradabilityShort,
          marketable: item.description.marketable,
          iconURL: icon,
          inspectLink: null,
          nametag: null,
          duplicates: duplicates[marketHashName],
          owner,
          price,
          type,
          collection: null,
          position: index,
        });
      });
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
      resolve(itemsPropertiesToReturn);
      // },
      // );
    },
  );
});

// it hides the original item name element and replaces it with one
// that is a link to it's market page and adds the doppler phase to the name
const changeName = (name, color, appID, marketHashName) => {
  const marketLink = getItemMarketLink(appID, marketHashName);
  const newNameElement = `<a class="hover_item_name custom_name" style="color: #${color}" href="${marketLink}" target="_blank">${name}</a>`;

  document.querySelector('.inventory_page_right').querySelectorAll('.hover_item_name').forEach((nameElement) => {
    nameElement.insertAdjacentHTML('afterend', DOMPurify.sanitize(newNameElement, { ADD_ATTR: ['target'] }));
    nameElement.classList.add('hidden');
  });
};

// adds market info in other inventories
const addStartingAtPrice = (appID, marketHashName) => {
  getPriceOverview(appID, marketHashName).then(
    (priceOverview) => {
      // removes previous leftover elements
      document.querySelectorAll('.startingAtVolume')
        .forEach((previousElement) => previousElement.remove());

      // adds new elements
      document.querySelectorAll('.item_owner_actions')
        .forEach((marketActions) => {
          marketActions.style.display = 'block';
          const startingAt = priceOverview.lowest_price === undefined ? 'Unknown' : priceOverview.lowest_price;
          const volume = priceOverview.volume === undefined ? 'Unknown amount' : priceOverview.volume;

          marketActions.insertAdjacentHTML('afterbegin',
            DOMPurify.sanitize(`<div class="startingAtVolume">
                     <div style="height: 24px;">
                        <a href="${getItemMarketLink(appID, marketHashName)}">
                            View in Community Market
                        </a>
                     </div>
                     <div style="min-height: 3em; margin-left: 1em;">
                        Starting at: ${startingAt}<br>Volume: ${volume} sold in the last 24 hours<br>
                     </div>
                   </div>
                `));
        });
    }, (error) => { console.log(error); },
  );
};

const addRightSideElements = () => {
  const activeIDs = getIDsOfActiveItem();
  if (activeIDs !== null) {
    // cleans up previously added elements
    cleanUpElements();
    const item = getItemByIDs(items, activeIDs.appID, activeIDs.contextID, activeIDs.assetID);
    const activeInventoryAppID = getActiveInventoryAppID();

    // removes previously added listeners
    document.querySelectorAll('.lowerModule, .marketActionInstantSell, .marketActionQuickSell, .copyItemID, .copyItemName, .copyItemLink').forEach((element) => {
      element.removeEventListener('click');
    });

    if (activeInventoryAppID === steamApps.CSGO.appID
      || activeInventoryAppID === steamApps.DOTA2.appID
      || activeInventoryAppID === steamApps.TF2.appID
    ) {
      document.querySelectorAll('#iteminfo1_item_actions, #iteminfo0_item_actions')
        .forEach((action) => {
          action.insertAdjacentHTML('afterend', DOMPurify.sanitize(`
          ${lowerModule}`));
        });

      if (activeInventoryAppID === steamApps.DOTA2.appID) {
        // hides "tags" and "tradable after" in one's own inventory
        document.querySelectorAll('#iteminfo1_item_tags, #iteminfo0_item_tags, #iteminfo1_item_owner_descriptors, #iteminfo0_item_owner_descriptors')
          .forEach((tagsElement) => {
            if (!tagsElement.classList.contains('hidden')) tagsElement.classList.add('hidden');
          });

        // allows the float pointer's text to go outside the boundaries of the item
        // they would not be visible otherwise on high-float items
        // also removes background from the right side of the page
        document.querySelectorAll('.item_desc_content').forEach((itemDescContent) => {
          itemDescContent.setAttribute('style', 'overflow: visible; background-image: url()');
        });
      }
    } else {
      document.querySelectorAll('.countdown').forEach((countdown) => {
        countdown.style.display = 'none';
      });
    }

    if (item) {
      if (activeInventoryAppID === steamApps.CSGO.appID
        || activeInventoryAppID === steamApps.DOTA2.appID
        || activeInventoryAppID === steamApps.TF2.appID) {
        if (activeInventoryAppID === steamApps.DOTA2.appID) {
          // adds the nametag text to nametags
          document.querySelectorAll('.nametag').forEach((nametag) => {
            if (item.nametag !== undefined) {
              nametag.innerText = item.nametag;
              document.querySelectorAll('.fraud_warning').forEach((fraudWarning) => {
                fraudWarning.outerHTML = '';
              });
            } else nametag.style.display = 'none';
          });

          // does not really work since it's loaded after this script..
          if (isSIHActive()) {
            document.querySelectorAll('.float_block').forEach((e) => e.remove());
            setTimeout(() => {
              document.querySelectorAll('.float_block').forEach((e) => e.remove());
            }, 1000);
          }
        }

        // sets the tradability info
        document.querySelectorAll('.tradabilityDiv').forEach((tradabilityDiv) => {
          if (item.tradability === 'Tradable') {
            tradabilityDiv.innerHTML = DOMPurify.sanitize(tradable);
            document.querySelectorAll('.countdown').forEach((countdown) => {
              countdown.style.display = 'none';
            });
          } else if (item.tradability === 'Not Tradable') {
            tradabilityDiv.innerHTML = DOMPurify.sanitize(notTradable);
            document.querySelectorAll('.countdown').forEach((countdown) => {
              countdown.style.display = 'none';
            });
          } else if (item.tradability === 'Tradelocked') {
            tradabilityDiv.innerHTML = DOMPurify.sanitize(tradeLocked);
            document.querySelectorAll('.countdown').forEach((countdown) => {
              countdown.style.display = 'none';
            });
          } else {
            const tradableAt = new Date(item.tradability).toString().split('GMT')[0];
            tradabilityDiv.innerHTML = DOMPurify.sanitize(`<span class='not_tradable'>Tradable After ${tradableAt}</span>`);
            countDown(tradableAt);
            document.querySelectorAll('.countdown').forEach((countdown) => {
              countdown.style.display = 'block';
            });
          }
        });
      }

      if (showDuplicates) {
        document.querySelectorAll('.duplicate').forEach((duplicate) => {
          if (item.duplicates !== undefined) {
            duplicate.style.display = 'block';
            duplicate.innerText = `x${item.duplicates.num}`;
          } else duplicate.style.display = 'none';
        });
      }

      // adds doppler phase  to the name and makes it a link to the market listings page
      // the name is retrieved from the page variables to keep the right local
      const name = getItemByIDs(
        getItemInfoFromPage(
          item.appid,
          item.contextid,
        ),
        item.appid,
        item.contextid,
        item.assetid,
      ).description.name;

      changeName(name, item.name_color, item.appid, item.market_hash_name);

      // adds "starting at" and sales volume to everyone's inventory
      if (!isOwnInventory()) addStartingAtPrice(item.appid, item.market_hash_name);
      else if (item.marketable) { // adds quick and instant sell buttons
        chrome.storage.local.get(['inventoryInstantQuickButtons', 'safeInstantQuickSell'], ({ inventoryInstantQuickButtons, safeInstantQuickSell }) => {
          if (inventoryInstantQuickButtons) {
            document.querySelectorAll('.item_market_actions').forEach((marketActions) => {
              marketActions.insertAdjacentHTML(
                'beforeend',
                DOMPurify.sanitize(
                  `<a class="marketActionInstantSell item_market_action_button item_market_action_button_green">
                           <span class="item_market_action_button_edge item_market_action_button_left"></span>
                           <span class="item_market_action_button_contents" title="List the item on the market to be bought by the highest buy order">Instant Sell</span>
                           <span class="item_market_action_button_edge item_market_action_button_right"></span>
                      </a>
                      <a class="marketActionQuickSell item_market_action_button item_market_action_button_green">
                           <span class="item_market_action_button_edge item_market_action_button_left"></span>
                           <span class="item_market_action_button_contents" title="List the item to be the cheapest on the market">Quick Sell</span>
                           <span class="item_market_action_button_edge item_market_action_button_right"></span>
                      </a>`,
                ),
              );

              marketActions.querySelectorAll('.marketActionInstantSell').forEach((instantSellButton) => {
                instantSellButton.addEventListener('click', () => {
                  if (safeInstantQuickSell && !window.confirm('Are you sure you want to Instant Sell this item?')) return; // eslint-disable-line no-alert

                  getHighestBuyOrder(
                    item.appid,
                    item.market_hash_name,
                  ).then((highestOrderPrice) => {
                    if (highestOrderPrice !== null) {
                      listItem(
                        item.appid,
                        item.contextid,
                        1,
                        item.assetid,
                        getPriceAfterFees(highestOrderPrice),
                      ).then(() => {
                        instantSellButton.querySelector('.item_market_action_button_contents').innerText = 'Listing created!';
                      }).catch((err) => {
                        console.log(err);
                        document.querySelectorAll('#iteminfo1_market_content, #iteminfo0_market_content').forEach((marketContent) => {
                          marketContent.insertAdjacentHTML('beforeend', DOMPurify.sanitize(`<div class="listingError">${err.message}</div>`));
                        });
                      });
                    } else {
                      document.querySelectorAll('#iteminfo1_market_content, #iteminfo0_market_content').forEach((marketContent) => {
                        marketContent.insertAdjacentHTML('beforeend', DOMPurify.sanitize('<div class="listingError">No buy orders to sell to.</div>'));
                      });
                    }
                  }).catch((err) => {
                    console.log(err);
                    document.querySelectorAll('#iteminfo1_market_content, #iteminfo0_market_content').forEach((marketContent) => {
                      marketContent.insertAdjacentHTML('beforeend', DOMPurify.sanitize(`<div class="listingError">${err}</div>`));
                    });
                  });
                });
              });

              marketActions.querySelectorAll('.marketActionQuickSell').forEach((quickSellButton) => {
                quickSellButton.addEventListener('click', () => {
                  if (safeInstantQuickSell && !window.confirm('Are you sure you want to Quick Sell this item?')) return; // eslint-disable-line no-alert

                  getLowestListingPrice(
                    item.appid,
                    item.market_hash_name,
                  ).then((lowestListingPrice) => {
                    const newPrice = lowestListingPrice > 3 ? lowestListingPrice - 1 : 3;
                    listItem(
                      item.appid,
                      item.contextid,
                      1,
                      item.assetid,
                      getPriceAfterFees(newPrice),
                    ).then(() => {
                      quickSellButton.querySelector('.item_market_action_button_contents').innerText = 'Listing created!';
                    }).catch((err) => {
                      console.log(err);
                      document.querySelectorAll('#iteminfo1_market_content, #iteminfo0_market_content').forEach((marketContent) => {
                        marketContent.insertAdjacentHTML('beforeend', DOMPurify.sanitize(`<div class="listingError">${err.message}</div>`));
                      });
                    });
                  }).catch((err) => {
                    console.log(err);
                    document.querySelectorAll('#iteminfo1_market_content, #iteminfo0_market_content').forEach((marketContent) => {
                      marketContent.insertAdjacentHTML('beforeend', DOMPurify.sanitize('<div class="listingError">Could not get lowest listing price</div>'));
                    });
                  });
                });
              });
            });
          }
        });
      }

      // adds the in-offer module
      chrome.storage.local.get(['activeOffers', 'itemInOffersInventory', 'inventoryShowCopyButtons'], ({
        activeOffers, itemInOffersInventory, inventoryShowCopyButtons,
      }) => {
        if (itemInOffersInventory) {
          const inOffers = activeOffers.items.filter((offerItem) => {
            return offerItem.assetid === item.assetid;
          });

          if (inOffers.length !== 0) {
            const offerLinks = inOffers.map((offerItem, index) => {
              const offerLink = offerItem.offerOrigin === 'sent'
                ? `https://steamcommunity.com/profiles/${offerItem.owner}/tradeoffers/sent#tradeofferid_${offerItem.inOffer}`
                : `https://steamcommunity.com/tradeoffer/${offerItem.inOffer}/`;

              const afterLinkChars = index === inOffers.length - 1
                ? '' // if it's the last one
                : ', ';

              return `<a href="${offerLink}" target="_blank">
              ${offerItem.inOffer}${afterLinkChars}
            </a>`;
            });

            const listString = `<div>${offerLinks.join('')}</div>`;
            const inTradesInfoModule = `
      <div class="descriptor inTradesInfoModule">
          In offer${inOffers.length > 1 ? 's' : ''}:
          ${listString}
      </div>`;

            document.querySelectorAll('#iteminfo1_item_descriptors, #iteminfo0_item_descriptors')
              .forEach((descriptor) => {
                descriptor.insertAdjacentHTML('afterend', DOMPurify.sanitize(inTradesInfoModule, { ADD_ATTR: ['target'] }));
              });
          }
        }

        if (inventoryShowCopyButtons) {
          document.querySelectorAll('.copyButtons')
            .forEach((copyButtons) => {
              copyButtons.insertAdjacentHTML(
                'afterbegin',
                DOMPurify.sanitize(
                  `<div class="copyItemID clickable" title="Copy the AssetID of the item.">
                      Copy ID
                  </div>
                  <div class="copyItemName clickable" title="Copy the full market name of the item.">
                      Copy Name
                  </div>
                  <div class="copyItemLink clickable" title="Copy the item's inventory link.">
                      Copy Link
                  </div>`,
                ),
              );
            });

          document.querySelectorAll('.copyItemID').forEach((element) => {
            element.addEventListener('click', () => {
              copyToClipboard(item.assetid);
            });
          });

          document.querySelectorAll('.copyItemName').forEach((element) => {
            element.addEventListener('click', () => {
              copyToClipboard(item.market_hash_name);
            });
          });

          document.querySelectorAll('.copyItemLink').forEach((element) => {
            element.addEventListener('click', () => {
              copyToClipboard(`https://steamcommunity.com/profiles/${item.owner}/inventory/#${item.appid}_${item.contextid}_${item.assetid}`);
            });
          });
        }
      });
    } else {
      // show the original names if the name can't be changed
      // because it can't be retrieved from the page
      document.querySelectorAll('.hover_item_name').forEach((name) => {
        name.classList.remove('hidden');
      });
    }
  } else console.log('Could not get IDs of active item');
};

const addRealTimePricesToQueue = () => {
  // if (!document.getElementById('selectButton').classList.contains('selectionActive')) {
  chrome.storage.local.get(
    ['realTimePricesAutoLoadInventory', 'realTimePricesMode'],
    ({ realTimePricesAutoLoadInventory, realTimePricesMode }) => {
      if (realTimePricesAutoLoadInventory) {
        const itemElements = [];
        const page = getActivePage('inventory');

        if (page !== null) {
          page.querySelectorAll('.item').forEach((item) => {
            if (!item.classList.contains('unknownItem')) itemElements.push(item);
          });
        } else {
          setTimeout(() => {
            addRealTimePricesToQueue();
          }, 1000);
        }

        if (itemElements) {
          itemElements.forEach((itemElement) => {
            if (itemElement.getAttribute('data-realtime-price') === null) {
              const IDs = getIDsFromElement(itemElement, 'inventory');
              const item = getItemByIDs(items, IDs.appID, IDs.contextID, IDs.assetID);

              itemElement.setAttribute('data-realtime-price', '0');
              if (item && item.marketable === 1) {
                priceQueue.jobs.push({
                  type: `inventory_${realTimePricesMode}`,
                  assetID: item.assetid,
                  appID: item.appid,
                  contextID: item.contextid,
                  market_hash_name: item.market_hash_name,
                  retries: 0,
                  showContrastingLook,
                  callBackFunction: addRealTimePriceToPage,
                });
              }
            }
          });

          if (!priceQueue.active) workOnPriceQueue();
        }
      }
    },
  );
  // }
};

// adds everything that is per item, like trade lock, exterior, doppler phases, border colors
const addPerItemInfo = (appID) => {
  const itemElements = document.querySelectorAll(`.item.app${appID}.context2`);
  if (itemElements.length !== 0) {
    chrome.storage.local.get([
      'showTradeLockIndicatorInInventories', 'colorfulItems',
    ],
    ({
      showTradeLockIndicatorInInventories, colorfulItems,
    }) => {
      itemElements.forEach((itemElement) => {
        if (itemElement.getAttribute('data-processed') === null
          || itemElement.getAttribute('data-processed') === 'false') {
          // in case the inventory is not loaded yet it retries in a second
          if (itemElement.id === undefined) {
            setTimeout(() => {
              addPerItemInfo(appID);
            }, 1000);
            return false;
          }
          const IDs = getIDsFromElement(itemElement, 'inventory');
          const item = getItemByIDs(items, IDs.appID, IDs.contextID, IDs.assetID);

          if (showTradeLockIndicatorInInventories && item) {
            // adds tradability indicator
            if (item.tradability !== 'Tradable' && item.tradability !== 'Not Tradable') {
              const contrastingLookClass = showContrastingLook ? 'contrastingBackground' : '';
              itemElement.insertAdjacentHTML(
                'beforeend',
                DOMPurify.sanitize(`<div class="perItemDate ${contrastingLookClass} not_tradable">${item.tradabilityShort}</div>`),
              );
            }
          }

          if (appID === steamApps.DOTA2.appID) {
            makeItemColorful(itemElement, item, colorfulItems);
            addPriceIndicator(
              itemElement, item.price, showContrastingLook,
            );
          }

          // marks the item "processed" to avoid additional unnecessary work later
          itemElement.setAttribute('data-processed', 'true');
          itemElement.setAttribute('data-price-ratio', pricePercentage);
        } else if (itemElement.getAttribute('data-processed') === 'true'
          && parseFloat(itemElement.getAttribute('data-price-ratio')) !== pricePercentage) {
          const currentPriceIndicatorEl = itemElement.querySelector('.priceIndicator');
          const IDs = getIDsFromElement(itemElement, 'inventory');
          const item = getItemByIDs(items, IDs.appID, IDs.contextID, IDs.assetID);

          if (currentPriceIndicatorEl) {
            currentPriceIndicatorEl.remove();
            addPriceIndicator(
              itemElement, item.price, showContrastingLook,
            );
            itemElement.setAttribute('data-price-ratio', pricePercentage);
          }
        }
      });
    });
  } else { // in case the inventory is not loaded yet
    setTimeout(() => {
      addPerItemInfo(appID);
    }, 1000);
  }
};

const setInventoryTotal = () => {
  chrome.storage.local.get(['currency'], ({ currency }) => {
    const inventoryTotalValueElement = document.getElementById('inventoryTotalValue');
    const totalPercentageApplied = inventoryTotal * (pricePercentage / 100);

    inventoryTotalValueElement.innerText = prettyPrintPrice(
      currency,
      (totalPercentageApplied).toFixed(0),
    );
  });
};

const sortItems = (inventoryItems, method) => {
  const activeAppID = getActiveInventoryAppID();
  if (activeAppID === steamApps.DOTA2.appID) {
    const itemElements = document.querySelectorAll('.item.app570.context2');
    const inventoryPages = document.getElementById(`inventory_${getInventoryOwnerID()}_570_2`).querySelectorAll('.inventory_page');
    doTheSorting(inventoryItems, Array.from(itemElements), method, Array.from(inventoryPages), 'inventory');
    addPerItemInfo(activeAppID);
  }
};

const doInitSorting = () => {
  chrome.storage.local.get('inventorySortingMode', (result) => {
    sortItems(items, result.inventorySortingMode);
    document.querySelector(`#sortingMethod [value="${result.inventorySortingMode}"]`).selected = true;
    addRealTimePricesToQueue();
  });
};

const addFunctionBar = () => {
  if (document.getElementById('inventory_function_bar') === null) {
    document.querySelector('.filter_ctn.inventory_filters').insertAdjacentHTML(
      'afterend',
      // DOMPurify sanitization breaks the svg icons and
      // the rest is static anyways, no external data here
      `<div id="inventory_function_bar">
          <div id="functionBarValues" class="functionBarRow">
              <span id="inventoryTotal"><span>Total Inventory Value: </span><span id="inventoryTotalValue">0.00</span></span>
          </div>
          <div id="functionBarActions" class="functionBarRow">
              <div id="sortingMenu">
                  <span>Sorting:</span>
                  <select id="sortingMethod">
                  </select>
              </div>
          </div>
      </div>`,
    );

    // shows currency mismatch warning and option to change currency
    chrome.storage.local.get('currency', ({ currency }) => {
      const walletCurrency = getSteamWalletCurrency();
      if (walletCurrency !== currency) {
        document.getElementById('currency_mismatch_warning').classList.remove('hidden');
        document.getElementById('changeCurrency').addEventListener('click', () => {
          chrome.storage.local.set({ currency: walletCurrency }, () => {
            chrome.runtime.sendMessage({ updateExchangeRates: 'updateExchangeRates' }, (() => {
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            }));
          });
        });
      }
    });

    const sortingSelect = document.getElementById('sortingMethod');

    const keys = Object.keys(sortingModes);
    
    for (const key of keys) {
      const option = document.createElement('option');
      option.value = sortingModes[key].key;
      option.text = sortingModes[key].name;
      sortingSelect.add(option);
    }

    sortingSelect.addEventListener('change', () => {
      sortItems(items, sortingSelect.options[sortingSelect.selectedIndex].value);
      addRealTimePricesToQueue();
    });
  } else setTimeout(() => { setInventoryTotal(); }, 1000);
};

const onFullDOTAInventoryLoad = () => {
  if (steamApps.DOTA2.appID === getActiveInventoryAppID()) {
    if (!isOwnInventory()) {
      getDOTAInventoryDataFromPage().then((inv) => {
        items = inv;
        addRightSideElements();
        addPerItemInfo(steamApps.DOTA2.appID);
        setInventoryTotal();
        addFunctionBar();
        addPageControlEventListeners('inventory', () => {
          addRealTimePricesToQueue();
        });
        doInitSorting();
      }).catch((err) => { console.log(err); });
    } else doInitSorting();
  }
};

// triggers steam's mechanism for loading complete inventories
// by default only the first 3 pages (75 items) are loaded
const loadFullInventory = () => {
  if (!isSIHActive() || !isOwnInventory()) {
    // basically checking if first call
    if (document.querySelector('body').getAttribute('allItemsLoaded') === null) {
      const loadFullInventoryScript = `
                g_ActiveInventory.LoadCompleteInventory().done(function () {
                    for (let i = 0; i < g_ActiveInventory.m_cPages; i++) {
                        g_ActiveInventory.m_rgPages[i].EnsurePageItemsCreated();
                        g_ActiveInventory.PreloadPageImages(i);
                    }
                    document.querySelector('body').setAttribute('allItemsLoaded', true);
                });
                `;
      if (injectScript(loadFullInventoryScript, true, 'loadFullInventory', 'allItemsLoaded') === null) {
        setTimeout(() => {
          loadFullInventory();
        }, 2000);
      } else {
        onFullDOTAInventoryLoad();
      }
    } else onFullDOTAInventoryLoad();
  } else doInitSorting();
};

// sends a message to the "back end" to request inventory contents
const requestInventory = (appID) => {
  const inventoryOwnerID = getInventoryOwnerID();
  if (appID === steamApps.DOTA2.appID) {
    // only use this for loading for own inventory
    // since the other endpoint does not provide any more details now
    // this avoids an additional request
    // hopefully fewer restricitions by steam
    if (isOwnInventory()) {
      chrome.runtime.sendMessage({ inventory: inventoryOwnerID }, (response) => {
        if (response !== 'error') {
          items = items.concat(response.items);
          inventoryTotal = response.total;
          addRightSideElements();
          addPerItemInfo(appID);
          setInventoryTotal();
          addFunctionBar();
          loadFullInventory();
          addPageControlEventListeners('inventory', () => {
            addRealTimePricesToQueue();
          });
        }
      });
    } else loadFullInventory();
  } else if (appID === steamApps.DOTA2.appID || appID === steamApps.TF2.appID) {
    chrome.runtime.sendMessage({
      getOtherInventory: {
        appID,
        steamID: inventoryOwnerID,
      },
    }, (response) => {
      if (response !== 'error') {
        items = items.concat(response.items);
        addRightSideElements();
        addPerItemInfo(appID);
        setInventoryTotal();
        addFunctionBar();
        loadFullInventory();
        addPageControlEventListeners('inventory', () => {
          addRealTimePricesToQueue();
        });
      }
    });
  }
};

const updateTradabilityIndicators = () => {
  const itemElements = document.querySelectorAll('.item.app730.context2');
  if (itemElements.length !== 0) {
    itemElements.forEach((itemElement) => {
      const IDs = getIDsFromElement(itemElement, 'inventory');
      const item = getItemByIDs(items, IDs.appID, IDs.contextID, IDs.assetID);
      const itemDateElement = itemElement.querySelector('.perItemDate');

      if (itemDateElement !== null) {
        const previText = itemDateElement.innerText;
        if (previText !== 'L') {
          const newText = getShortDate(item.tradability);
          itemDateElement.innerText = newText;

          if (previText !== 'T' && newText === 'T') {
            itemDateElement.classList.remove('not_tradable');
            itemDateElement.classList.add('tradable');
          }
        }
      }
    });
  }
};
const hideOtherExtensionPrices = () => {
  // sih
  if (!document.hidden && isSIHActive()) {
    document.querySelectorAll('.price_flag').forEach((price) => {
      price.remove();
    });
  }

  setTimeout(() => {
    hideOtherExtensionPrices();
  }, 2000);
};

// keeps trying to load the items from the page
// for apps that don't require a separate inventory request
const loadInventoryItems = (appID, contextID) => {
  const inventory = getItemInfoFromPage(appID, contextID);
  if (inventory.length !== 0) {
    items = items.concat(inventory);
    addRealTimePricesToQueue();

    if (inventory.length === 75) {
      loadFullInventory();
      setTimeout(() => {
        loadInventoryItems(appID, contextID);
      }, 2000);
    }
  } else {
    setTimeout(() => {
      loadInventoryItems(appID, contextID);
    }, 1000);
  }
};

const defaultActiveInventoryAppID = getActiveInventoryAppID();

logExtensionPresence();
updateWalletCurrency();

if (defaultActiveInventoryAppID !== null) {
  chrome.storage.local.get([
    'inventoryShowDuplicateCount', 'contrastingLook',
  ], ({
    inventoryShowDuplicateCount, contrastingLook,
  }) => {
    showContrastingLook = contrastingLook;
    showDuplicates = inventoryShowDuplicateCount;
  });

  // listens to manual inventory tab/game changes
  const inventoriesMenu = document.querySelector('.games_list_tabs');
  if (inventoriesMenu !== null) {
    inventoriesMenu.querySelectorAll('.games_list_tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const appID = getActiveInventoryAppID();
        const contextID = getDefaultContextID(appID);
        if (appID === steamApps.CSGO.appID || appID === steamApps.DOTA2.appID
          || appID === steamApps.TF2.appID) {
          requestInventory(appID);
        } else {
          loadInventoryItems(appID, contextID);
        }
      });
    });
  }

  // mutation observer observes changes on the right side of the inventory interface
  // this is a workaround for waiting for ajax calls to finish when the page changes
  let lastStyle = '';

  const observer = new MutationObserver((mutationRecord) => {
    mutationRecord.forEach((mutation) => {
      if ((!lastStyle.includes('display: none;') && mutation.target.getAttribute('style').includes('display: none;'))
        || (lastStyle.includes('display: none;') && !mutation.target.getAttribute('style').includes('display: none;'))) {
        lastStyle = mutation.target.getAttribute('style');
        addRightSideElements();
        addFunctionBar();

        if (getActiveInventoryAppID() !== steamApps.DOTA2.appID) {
          // unhides "tags" in non-csgo inventories
          document.querySelectorAll('#iteminfo1_item_tags, #iteminfo0_item_tags, #iteminfo1_item_owner_descriptors, #iteminfo0_item_owner_descriptors')
            .forEach((tagsElement) => {
              tagsElement.classList.remove('hidden');
            });
        }
      }
    });
  });

  let observer2LastTriggered = Date.now() - 501;
  // the mutation observer is only allowed to trigger the logic twice a second
  // this is to save on cpu cycles
  const observer2 = new MutationObserver(() => {
    if (Date.now() > observer2LastTriggered + 500) {
      addPerItemInfo(getActiveInventoryAppID());
    }
    observer2LastTriggered = Date.now();
  });

  // does not execute if inventory is private or failed to load the page
  // (502 for example, mostly when steam is dead)
  if (document.getElementById('no_inventories') === null
    && document.getElementById('iteminfo0') !== null) {
    observer.observe(document.getElementById('iteminfo0'), {
      subtree: false,
      attributes: true,
    });

    observer2.observe(document.getElementById('inventories'), {
      subtree: false,
      attributes: true,
    });
  }

  repositionNameTagIcons();
  addSearchListener('inventory', () => {
    addRealTimePricesToQueue();
  });
  overridePopulateActions();
  updateLoggedInUserInfo();
  updateLoggedInUserName();
  addUpdatedRibbon();

  chrome.storage.local.get(['hideOtherExtensionPrices', 'moveWithArrowKeysInventory'], (results) => {
    if (results.hideOtherExtensionPrices) hideOtherExtensionPrices();
    if (results.moveWithArrowKeysInventory) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();

          const activePage = getActivePage('inventory');
          let activePageActiveItem = null;
          let activeItemIndex = -1;

          if (activePage !== null) {
            activePage.querySelectorAll('.item.app730.context2').forEach((itemElement, index) => {
              if (itemElement.classList.contains('activeInfo')) {
                activePageActiveItem = itemElement;
                activeItemIndex = index;
              }
            });
          }

          // when the active item is not on the active page
          if (!event.ctrlKey && activePageActiveItem === null) {
            const currentActivePage = getActivePage('inventory');
            currentActivePage.querySelectorAll('.item')[0].querySelector('a').click();
          }

          // inventory page are 5 items per row, 5 rows per page = 25 items per page
          switch (event.key) {
            case 'ArrowLeft':
              if (event.ctrlKey) goToPreviousInventoryPage();
              else if (activeItemIndex === 0) { // when it's the first item on the page
                goToPreviousInventoryPage();
              } else if (activeItemIndex > 0) {
                activePage.querySelectorAll('.item')[activeItemIndex - 1].querySelector('a').click();
              }
              break;
            case 'ArrowRight':
              if (event.ctrlKey) gotToNextInventoryPage();
              else if (activeItemIndex >= 0 && activeItemIndex < 24) {
                activePage.querySelectorAll('.item')[activeItemIndex + 1].querySelector('a').click();
              } else if (activeItemIndex === 24) { // when it's the last item on the page
                gotToNextInventoryPage();
              }
              break;
            case 'ArrowUp':
              if (activeItemIndex >= 0 && activeItemIndex < 5) {
                activePage.querySelectorAll('.item')[activeItemIndex + 20].querySelector('a').click();
              } else if (activeItemIndex >= 5 && activeItemIndex < 20) {
                activePage.querySelectorAll('.item')[activeItemIndex - 5].querySelector('a').click();
              }
              break;
            case 'ArrowDown':
              if (activeItemIndex >= 0 && activeItemIndex < 20) {
                activePage.querySelectorAll('.item')[activeItemIndex + 5].querySelector('a').click();
              } else if (activeItemIndex >= 20) {
                activePage.querySelectorAll('.item')[activeItemIndex - 20].querySelector('a').click();
              }
              break;
            default: break;
          }
        }
      });
    }
  });

  if (defaultActiveInventoryAppID === steamApps.CSGO.appID
    || defaultActiveInventoryAppID === steamApps.DOTA2.appID
    || defaultActiveInventoryAppID === steamApps.TF2.appID) {
    requestInventory(defaultActiveInventoryAppID);
  } else {
    loadInventoryItems(
      defaultActiveInventoryAppID,
      getDefaultContextID(defaultActiveInventoryAppID),
    );
  }

  // to refresh the trade lock remaining indicators
  setInterval(() => {
    if (!document.hidden) updateTradabilityIndicators();
  }, 60000);
} else console.log('Could not get active inventory app ID, private inventory? Functions disabled.');

reloadPageOnExtensionReload();
