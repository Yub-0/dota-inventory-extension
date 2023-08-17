import React from 'react';

const Popup = () => {
  chrome.runtime.sendMessage({ badgetext: '' }, () => { });

  return (
    <div className="popup">
      DOTA 2 EXTENSION
    </div>
  );
};

export default Popup;
