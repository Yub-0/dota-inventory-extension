import {
  goToInternalPage, validateSteamAPIKey,
} from 'utils/utilsModular';
import { getItemMarketLink } from 'utils/simpleUtils';
import { getPlayerSummaries } from 'utils/ISteamUser';
import { getUserDOTAInventory, getUserDOTAInventoryAlternative, getOtherInventory } from 'utils/getUserInventory';
import { updateExchangeRates } from 'utils/pricing';

// content scripts can't make cross domain requests because of security
// most of the messaging required is to work around this limitation
// and make the request from background script context
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.inventory !== undefined) {
    chrome.storage.local.get('steamIDOfUser', ({ steamIDOfUser }) => {
      const inventoryLoadFunction = steamIDOfUser === request.inventory
        ? getUserDOTAInventory
        : getUserDOTAInventoryAlternative;
      inventoryLoadFunction(request.inventory).then(({ items, total }) => {
        sendResponse({ items, total });
      }).catch(() => {
        sendResponse('error');
      });
    });
    return true; // async return to signal that it will return later
  }
  if (request.badgetext !== undefined) {
    chrome.browserAction.setBadgeText({ text: request.badgetext });
    sendResponse({ badgetext: request.badgetext });
  } else if (request.openInternalPage !== undefined) {
    chrome.permissions.contains({ permissions: ['tabs'] }, (result) => {
      if (result) {
        goToInternalPage(request.openInternalPage);
        sendResponse({ openInternalPage: request.openInternalPage });
      } else sendResponse({ openInternalPage: 'no_tabs_api_access' });
    });
    return true;
  } else if (request.setAlarm !== undefined) {
    chrome.alarms.create(request.setAlarm.name, {
      when: new Date(request.setAlarm.when).valueOf(),
    });
    // chrome.alarms.getAll((alarms) => {console.log(alarms)});
    sendResponse({ setAlarm: request.setAlarm });
  } else if (request.apikeytovalidate !== undefined) {
    validateSteamAPIKey(request.apikeytovalidate).then(
      (apiKeyValid) => {
        sendResponse({ valid: apiKeyValid });
      }, (error) => {
        console.log(error);
        sendResponse('error');
      },
    );
    return true; // async return to signal that it will return later
  } else if (request.GetPersonaState !== undefined) {
    getPlayerSummaries([request.GetPersonaState]).then((summaries) => {
      sendResponse({
        personastate: summaries[request.GetPersonaState].personastate,
        apiKeyValid: true,
      });
    }).catch((err) => {
      console.log(err);
      if (err === 'api_key_invalid') {
        sendResponse({ apiKeyValid: false });
      } else sendResponse('error');
    });
    return true; // async return to signal that it will return later
  } else if (request.getBuyOrderInfo !== undefined) {
    const getRequest = new Request(
      getItemMarketLink(request.getBuyOrderInfo.appID, request.getBuyOrderInfo.marketHashName),
    );

    fetch(getRequest).then((response) => {
      if (!response.ok) {
        sendResponse('error');
        console.log(`Error code: ${response.status} Status: ${response.statusText}`);
      } else return response.text();
    }).then((body1) => {
      let itemNameId = '';
      try { itemNameId = body1.split('Market_LoadOrderSpread( ')[1].split(' ')[0]; } catch (e) {
        console.log(e);
        console.log(body1);
        sendResponse('error');
      }
      const getRequest2 = new Request(`https://steamcommunity.com/market/itemordershistogram?country=US&language=english&currency=${request.getBuyOrderInfo.currencyID}&item_nameid=${itemNameId}`);
      fetch(getRequest2).then((response) => {
        if (!response.ok) {
          sendResponse('error');
          console.log(`Error code: ${response.status} Status: ${response.statusText}`);
        } else return response.json();
      }).then((body2) => {
        sendResponse({ getBuyOrderInfo: body2 });
      }).catch((err) => {
        console.log(err);
        sendResponse('error');
      });
    }).catch((err) => {
      console.log(err);
      sendResponse('error');
    });

    return true; // async return to signal that it will return later
  } else if (request.updateExchangeRates !== undefined) {
    updateExchangeRates();
    sendResponse('exchange rates updated');
  } else if (request.hasTabsAccess !== undefined) {
    chrome.permissions.contains(
      { permissions: ['tabs'] },
      (result) => {
        sendResponse(result);
      },
    );
    return true; // async return to signal that it will return later
  } else if (request.getOtherInventory !== undefined) { // dota and tf2 for now
    getOtherInventory(
      request.getOtherInventory.appID,
      request.getOtherInventory.steamID,
    ).then(({ items }) => {
      sendResponse({ items });
    }).catch(() => {
      sendResponse('error');
    });
    return true; // async return to signal that it will return later
  } else if (request.closeTab !== undefined) {
    chrome.tabs.remove(sender.tab.id);
    return true; // async return to signal that it will return later
  }
});

chrome.runtime.onConnect.addListener(() => { });
