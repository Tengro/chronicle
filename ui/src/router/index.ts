import { createRouter, createWebHashHistory } from 'vue-router';

// Use hash-based routing so the UI can be mounted at any path (e.g., /chronicle)
// Routes become: /chronicle/#/states, /chronicle/#/branches, etc.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'records',
      component: () => import('../views/RecordsView.vue'),
    },
    {
      path: '/states',
      name: 'states',
      component: () => import('../views/StatesView.vue'),
    },
    {
      path: '/branches',
      name: 'branches',
      component: () => import('../views/BranchesView.vue'),
    },
  ],
});

export default router;
