import { createBrowserRouter } from 'react-router';
import { DashboardPage } from './components/DashboardPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: DashboardPage,
  },
  {
    path: '*',
    Component: DashboardPage,
  },
]);
