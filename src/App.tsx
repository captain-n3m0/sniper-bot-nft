/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Metrics } from './pages/Metrics';
import { Status } from './pages/Status';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/status" element={<Status />} />
      </Routes>
    </BrowserRouter>
  );
}
