import React, { Suspense, lazy } from 'react';

import 'bootstrap/dist/css/bootstrap.min.css';
import './App.scss';

const Popup = lazy(() => import('./pages/Popup/Popup'));

const App = () => {
  if (window.location.search === '?page=popup') {
    return (
      <Suspense fallback={<div>Loading...</div>}>
        <Popup />
      </Suspense>
    );
  }
};

export default App;
