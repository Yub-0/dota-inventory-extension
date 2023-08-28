# Build And Use
`npm run build` creates a complete build in the `build` directory. 
- You can now use the build folder to load the extension. Further steps to be done in the browser:
- Goto Chrome Settings using three dots on the top right corner and select extension or just use `chrome://extensions` on the url.
- Enable developer mode
- Click on Load Unpacked and select the path inside the build folder where the manifest file is loacated.
- The extension will be installed now.

# Backend Info
- Currently works by fetching pricing data from a local backend api
- price fetching is done by function [getDotaPrice()](src\utils\pricing.js) which calls the backend api 
- backend can be found at [dota-price-scrapper](https://github.com/Yub-0/dota-price-scrapper)
- run the backend at `127.0.0.1:8000` or any suitable binding address preferable
- configure variable [API_HOST](src\utils\static\apiIndex.js) according the endpoint binding address open at the backend.
- eg: `API_HOST = '127.0.0.1:8000'`, `API_HOST = '192.168.1.122:8001'`, etc.

# Inspiration
Yo, check it out! This project is built off of the dope [csgo-trader-extension](https://github.com/gergelyszabo94/csgo-trader-extension) made by the homie [@gergelyszabo94](https://github.com/gergelyszabo94).
But, we've made some major changes and improvements to fit our own needs and goals.
Big shoutout to `@gergelyszabo94` for being a genius and sharing their work with the open-source community. Much love!