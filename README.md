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
- run the backend at `127.0.0.1:8000` to enable price fetching

# Inspiration
This project is based on [csgo-trader-extension](https://github.com/gergelyszabo94/csgo-trader-extension), created by [@gergelyszabo94](https://github.com/gergelyszabo94). While this project draws inspiration from the original work, it includes substantial modifications and enhancements to meet specific requirements and objectives.
I would like to acknowledge the creative mind of `@gergelyszabo94` and express my gratitude for making their work available to the open-source community.