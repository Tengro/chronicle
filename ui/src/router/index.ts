import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
