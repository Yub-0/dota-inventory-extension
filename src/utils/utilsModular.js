import { injectScript, injectStyle } from 'utils/injection';
import { getUserSteamID } from 'utils/steamID';
import DOMPurify from 'dompurify';
import { getIDsFromElement } from 'utils/itemsToElementsToItems';

const logExtensionPresence = () => {
  const { version } = chrome.runtime.getManifest();
  console.log(`Dota Extension ${version} is running on this page.`);
  console.log('"DevTools failed to parse SourceMap" is not an error, you can disregard it.');
};

const getAppropriateFetchFunc = () => {
  // works around the different behavior when fetching from chromium or ff
  // This is accomplished by exposing more privileged XHR and
  // fetch instances in the content script,
  // which has the side-effect of not setting the Origin and
  // Referer headers like a request from the page itself would;
  // this is often preferable to prevent the request from revealing its cross-orign nature.
  // In Firefox, extensions that need to perform requests that behave as if they were
  // sent by the content itself can use  content.XMLHttpRequest and content.fetch() instead.
  // For cross-browser extensions, the presence of these methods must be feature-detected.
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#XHR_and_Fetch
  // const fetchFunction = content !== undefined ? content.fetch : fetch;

  let fetchFunction = fetch;

  try {
    // eslint-disable-next-line no-undef
    fetchFunction = content !== undefined ? content.fetch : fetch;
    // eslint-disable-next-line no-empty
  } catch (e) { }

  return fetchFunction;
};

const validateSteamAPIKey = (apiKey) => new Promise((resolve, reject) => {
  const getRequest = new Request(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=76561198036030455`);

  fetch(getRequest).then((response) => {
    if (!response.ok) {
      console.log(`Error code: ${response.status} Status: ${response.statusText}`);
      reject(response.status);
    } else return response.json();
  }).then((body) => {
    try {
      if (body.response.players[0].steamid === '76561198036030455') resolve(true);
      else resolve(false);
    } catch (e) {
      console.log(e);
      reject(e);
    }
  }).catch((err) => {
    console.log(err);
    reject(err);
  });
});

const scrapeSteamAPIkey = () => {
  const getRequest = new Request('https://steamcommunity.com/dev/apikey');

  fetch(getRequest).then((response) => {
    if (!response.ok) console.log(`Error code: ${response.status} Status: ${response.statusText}`);
    else return response.text();
  }).then((body) => {
    const html = document.createElement('html');
    html.innerHTML = DOMPurify.sanitize(body);
    let apiKey = null;

    try {
      apiKey = html.querySelector('#bodyContents_ex').querySelector('p').innerText.split(': ')[1];
    } catch (e) {
      console.log(e);
      console.log(body);
    }

    validateSteamAPIKey(apiKey).then(
      (apiKeyValid) => {
        if (apiKeyValid) {
          console.log('api key valid');
          chrome.storage.local.set({ steamAPIKey: apiKey, apiKeyValid: true }, () => { });
        }
      }, (error) => {
        console.log(error);
      },
    );
  }).catch((err) => {
    console.log(err);
  });
};

const arrayFromArrayOrNotArray = (arrayOrNotArray) => {
  if (!Array.isArray(arrayOrNotArray)) return [arrayOrNotArray];
  return arrayOrNotArray;
};

const removeFromArray = (array, arrayIndex) => {
  const newArray = [];

  array.forEach((element, index) => {
    if (index !== arrayIndex) newArray.push(element);
  });

  return newArray;
};

const getNameTag = (item) => {
  try {
    if (item.fraudwarnings !== undefined || item.fraudwarnings[0] !== undefined) {
      return item.fraudwarnings[0].split('Name Tag: \'\'')[1].split('\'\'')[0];
    }
    // eslint-disable-next-line no-empty
  } catch (error) { return null; }
};

const getInspectLink = (item, owner, assetID) => {
  try {
    if (item.actions !== undefined && item.actions[0] !== undefined) {
      const beginning = item.actions[0].link.split('%20S')[0];
      const end = item.actions[0].link.split('%assetid%')[1];
      return owner !== undefined
        ? (`${beginning}%20S${owner}A${assetID}${end}`)
        : (`${beginning}%20S${item.owner}A${item.assetid}${end}`);
    }
    // eslint-disable-next-line no-empty
  } catch (error) { return null; }
};

const goToInternalPage = (targetURL) => {
  chrome.tabs.query({}, (tabs) => {
    for (let i = 0; i < tabs.length; i += 1) {
      const tab = tabs[i];
      if (tab.url === (`chrome-extension://${chrome.runtime.id}${targetURL}`)) { // TODO make this work in firefox or remove the whole thing
        chrome.tabs.reload(tab.id, {}, () => { });
        chrome.tabs.update(tab.id, { active: true });
        return;
      }
    }
    chrome.tabs.create({ url: targetURL });
  });
};

const listenToLocationChange = (callBackFunction) => {
  let oldHref = document.location.href;

  const locationObserver = new MutationObserver((mutations) => {
    mutations.forEach(() => {
      if (oldHref !== document.location.href) {
        oldHref = document.location.href;
        callBackFunction();
      }
    });
  });

  locationObserver.observe(document.querySelector('body'), {
    subtree: true,
    childList: true,
  });
};

const getAssetIDFromInspectLink = (inspectLink) => ((inspectLink !== null && inspectLink !== undefined) ? inspectLink.split('A')[1].split('D')[0] : null);

const getActivePage = (type, getActiveInventory) => {
  let activePage = null;
  if (type === 'inventory') {
    document.querySelectorAll('.inventory_ctn').forEach((inventory) => {
      if (inventory.style.display !== 'none') {
        inventory.querySelectorAll('.inventory_page').forEach((page) => {
          if (page.style.display !== 'none') activePage = page;
        });
      }
    });
  } else if (type === 'offer') {
    const activeInventory = getActiveInventory();
    if (activeInventory !== null) {
      activeInventory.querySelectorAll('.inventory_page')
        .forEach((page) => {
          if (page.style.display !== 'none') activePage = page;
        });
    }
  }
  return activePage;
};

const addPageControlEventListeners = (type, addFloatIndicatorsFunction) => {
  const pageControls = document.getElementById('inventory_pagecontrols');
  if (pageControls !== null) {
    pageControls.addEventListener('click', () => {
      setTimeout(() => {
        if (type === 'inventory') addFloatIndicatorsFunction(getActivePage('inventory'));
        else if (type === 'offer') addFloatIndicatorsFunction('page');
      }, 100);
    });
  } else setTimeout(() => { addPageControlEventListeners(); }, 1000);
};

// gets the details of an item by matching the passed asset id with the ones from the api call
const getItemByAssetID = (items, assetIDToFind) => {
  if (items === undefined || items.length === 0) return null;
  return items.filter((item) => item.assetid === assetIDToFind)[0];
};

const getAssetIDOfElement = (element) => {
  const IDs = getIDsFromElement(element);
  return IDs === null ? null : IDs.assetID;
};

const addPriceIndicator = (
  itemElement, priceInfo, currency, showContrastingLook, pricePercentage = 100,
) => {
  console.log(priceInfo, currency, pricePercentage);
  if (priceInfo !== undefined && priceInfo !== 'null' && priceInfo !== null) {
    const disPlayPrice = priceInfo;
    // const disPlayPrice = pricePercentage === 100
    //   ? priceInfo.display
    //   : currencies[currency].sign + (priceInfo.price * (pricePercentage / 100)).toFixed(2);
    const contrastingLookClass = showContrastingLook ? 'contrastingBackground' : '';
    itemElement.insertAdjacentHTML(
      'beforeend', DOMPurify.sanitize(`<div class='priceIndicator ${contrastingLookClass}'>${disPlayPrice}</div>`),
    );
  }
};

const reloadPageOnExtensionReload = () => {
  // reloads the page on extension update/reload/uninstall
  chrome.runtime.connect().onDisconnect.addListener(() => {
    window.location.reload();
  });
};

const isSIHActive = () => {
  const SIHSwitch = document.getElementById('switchPanel');
  const SIHSwitcherCheckbox = document.getElementById('switcher');
  return (SIHSwitch !== null && SIHSwitcherCheckbox !== null && SIHSwitcherCheckbox.checked);
};

let searchListenerTimeout = null;
const addSearchListener = (type, addFloatIndicatorsFunction) => {
  let searchElement;
  if (type === 'inventory') searchElement = document.getElementById('filter_control');
  else if (type === 'offer') searchElement = document.querySelector('.filter_search_box');

  if (searchElement !== null) {
    searchElement.addEventListener('input', () => {
      if (searchListenerTimeout !== null) clearTimeout(searchListenerTimeout);
      searchListenerTimeout = setTimeout(() => {
        if (type === 'inventory') addFloatIndicatorsFunction(getActivePage('inventory'));
        else if (type === 'offer') addFloatIndicatorsFunction('page');
        searchListenerTimeout = null;
      }, 1000);
    });
  } else {
    setTimeout(() => {
      addSearchListener(type);
    }, 1000);
  }
};

const getSessionID = () => {
  const getSessionIDScript = 'document.querySelector(\'body\').setAttribute(\'sessionid\', g_sessionID);';
  return injectScript(getSessionIDScript, true, 'getSessionID', 'sessionid');
};

// updates the SteamID of the extension's user in storage
const updateLoggedInUserInfo = () => {
  const steamID = getUserSteamID();
  if (steamID !== 'false' && steamID !== false && steamID !== null) {
    chrome.storage.local.set({
      steamIDOfUser: steamID,
      steamSessionID: getSessionID(),
    }, () => { });
  }
};

// updates the nick name (persona name) of the extension's user in storage
const updateLoggedInUserName = () => {
  const pullDownElement = document.getElementById('account_pulldown');

  if (pullDownElement !== null) { // if it's  null then the user is not logged in
    const nickName = pullDownElement.innerText;

    chrome.storage.local.set({
      nickNameOfUser: nickName,
    }, () => { });
  }
};

const repositionNameTagIcons = () => {
  injectStyle(`
    .slot_app_fraudwarning {
        top: 19px !important;
        left: 75px !important;
    }`, 'nametagWarning');
};

const jumpToAnchor = (anchor) => {
  if (anchor !== '') {
    window.location = `${window.location.origin}${window.location.pathname}${anchor}`;
  }
};

const removeOfferFromActiveOffers = (offerID) => {
  chrome.storage.local.get(['activeOffers'], ({ activeOffers }) => {
    const itemsNotInThisOffer = activeOffers.items.filter((item) => {
      return item.inOffer !== offerID;
    });

    const sentNotThisOffer = activeOffers.sent.filter((offer) => {
      return offer.tradeofferid !== offerID;
    });

    const receivedNotThisOffer = activeOffers.received.filter((offer) => {
      return offer.tradeofferid !== offerID;
    });

    chrome.storage.local.set({
      activeOffers: {
        lastFullUpdate: activeOffers.lastFullUpdate,
        items: itemsNotInThisOffer,
        sent: sentNotThisOffer,
        received: receivedNotThisOffer,
        descriptions: activeOffers.descriptions,
      },
    }, () => { });
  });
};

const addUpdatedRibbon = () => {
  chrome.storage.local.get(['showUpdatedRibbon'], ({ showUpdatedRibbon }) => {
    if (showUpdatedRibbon) {
      document.querySelector('body').insertAdjacentHTML(
        'afterbegin',
        DOMPurify.sanitize(
          `<div id="extensionUpdatedRibbon">
                      Thank you for trying my extension. Check out how it works  
                      <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=RickAstley" target="_blank" title="Scammed">
                          here!
                      </a>
                      <span class="clickable" id="closeUpdatedRibbon" title="Close ribbon until the next update">Close lol</span>
                    </div>`,
          { ADD_ATTR: ['target'] },
        ),
      );
      document.getElementById('closeUpdatedRibbon').addEventListener('click', () => {
        chrome.storage.local.set({ showUpdatedRibbon: false }, () => {
          document.getElementById('extensionUpdatedRibbon').classList.add('hidden');
        });
      });
    }
  });
};

const copyToClipboard = (text) => {
  // this is a workaround to only being able to copy text
  // to the clipboard that is selected in a textbox
  document.querySelector('body').insertAdjacentHTML(
    'beforeend',
    DOMPurify.sanitize(`
        <textarea id="text_area_to_copy_to_clipboard" class="hidden-copy-textarea" readonly="">${text}</textarea>`),
  );

  const textAreaElement = document.getElementById('text_area_to_copy_to_clipboard');
  textAreaElement.select();
  document.execCommand('copy');
  textAreaElement.remove();
};

const changePageTitle = (type, text) => {
  chrome.storage.local.get(['usefulTitles'], ({ usefulTitles }) => {
    if (usefulTitles) {
      let title = document.title.split(':: ')[1];
      switch (type) {
        case 'own_profile': title = 'My profile'; break;
        case 'profile': title = `${title}'s profile`; break;
        case 'market_listing': title = `${text} - Market Listings`; break;
        case 'trade_offer': title = `${text} - Trade Offer`; break;
        case 'own_inventory': title = 'My Inventory'; break;
        case 'inventory': title = `${title}'s inventory`; break;
        case 'trade_offers': title = text; break;
        default: break;
      }
      document.title = title;
    }
  });
};

const removeLinkFilterFromLinks = () => {
  chrome.storage.local.get('linkFilterOff', ({ linkFilterOff }) => {
    if (linkFilterOff) {
      document.querySelectorAll('a').forEach((anchor) => {
        const oldHref = anchor.getAttribute('href');
        if (oldHref !== null && oldHref.includes('https://steamcommunity.com/linkfilter/?url=')) {
          anchor.setAttribute(
            'href',
            oldHref.split('https://steamcommunity.com/linkfilter/?url=')[1],
          );
        }
      });
    }
  });
};

// finds unread moderation messages and loads the page to mark them as read
const markModMessagesAsRead = () => {
  chrome.storage.local.get('steamIDOfUser', ({ steamIDOfUser }) => {
    const getRequest = new Request(`https://steamcommunity.com/profiles/${steamIDOfUser}/moderatormessages`);
    fetch(getRequest).then((response) => {
      if (!response.ok) {
        console.log(`Error code: ${response.status} Status: ${response.statusText}`);
        return null;
      }
      return response.text();
    }).then((body) => {
      if (body !== null) {
        const html = document.createElement('html');
        html.innerHTML = DOMPurify.sanitize(body);

        const unreadMessageLinks = [];
        const unreadMessagesElements = html.querySelectorAll('div.commentnotification.moderatormessage.unread');
        unreadMessagesElements.forEach((unread) => {
          unreadMessageLinks.push(unread.querySelector('a').getAttribute('href'));
        });

        unreadMessageLinks.forEach((link) => {
          fetch(new Request(link)).then(() => { });
        });
      }
    }).catch((err) => {
      console.log(err);
    });
  });
};

// chrome only allows notification icons locally
// or from trusted (by manifest) urls
// this is a workaround to that because Steam's CDN is not in the manifest
const getRemoteImageAsObjectURL = (imageURL) => new Promise((resolve, reject) => {
  fetch(new Request(imageURL)).then((response) => {
    if (!response.ok) {
      reject(response);
      console.log(`Error code: ${response.status} Status: ${response.statusText}`);
    } else return response.blob();
  }).then((body) => {
    resolve(URL.createObjectURL(body));
  }).catch((err) => {
    console.log(err);
    reject(err);
  });
});

// true when chrome or edge, false on ff
const isChromium = () => {
  return chrome.extension.getURL('/index.html').includes('chrome-extension');
};

//  unused atm
// const generateRandomString = (length) => {
//   let text = '';
//   const allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//
//   for (let i = 0; i < length; i++) {
//     text += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
//   }
//
//   return text;
// };

export {
  logExtensionPresence, scrapeSteamAPIkey, arrayFromArrayOrNotArray, removeFromArray, changePageTitle,
  goToInternalPage, jumpToAnchor, copyToClipboard,
  validateSteamAPIKey, getAssetIDFromInspectLink, updateLoggedInUserInfo,
  listenToLocationChange, addPageControlEventListeners, getItemByAssetID,
  getAssetIDOfElement, getActivePage, addPriceIndicator, updateLoggedInUserName, removeLinkFilterFromLinks,
  getInspectLink, markModMessagesAsRead,
  reloadPageOnExtensionReload, isSIHActive, addSearchListener, getSessionID, getNameTag, repositionNameTagIcons,
  removeOfferFromActiveOffers, addUpdatedRibbon, getRemoteImageAsObjectURL,
  isChromium, getAppropriateFetchFunc,
};
