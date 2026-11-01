import axios from 'axios';

export const TOKEN_KEY = 'lx_token';
export const USER_KEY = 'lx_user';

const api = axios.create({ baseURL: '/api', timeout: 60000 });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const unwrap = (p) => p.then((r) => r.data.data);
export const apiError = (e) => e?.response?.data?.error || e?.message || '请求失败';

export const auth = {
  login: (b) => unwrap(api.post('/auth/login', b)),
  register: (b) => unwrap(api.post('/auth/register', b)),
  me: () => unwrap(api.get('/auth/me')),
  changePassword: (b) => unwrap(api.post('/auth/password', b)),
};

export const vendors = {
  list: () => unwrap(api.get('/vendors')),
  create: (b) => unwrap(api.post('/vendors', b)),
  update: (id, b) => unwrap(api.put(`/vendors/${id}`, b)),
  remove: (id) => unwrap(api.delete(`/vendors/${id}`)),
  fetchModels: (b) => unwrap(api.post('/vendors/fetch-models', b)),
  test: (id) => unwrap(api.post(`/vendors/${id}/test`)),
};

export const groups = {
  list: () => unwrap(api.get('/groups')),
  create: (b) => unwrap(api.post('/groups', b)),
  update: (id, b) => unwrap(api.put(`/groups/${id}`, b)),
  remove: (id) => unwrap(api.delete(`/groups/${id}`)),
};

export const models = {
  list: () => unwrap(api.get('/models')),
  create: (b) => unwrap(api.post('/models', b)),
  batch: (b) => unwrap(api.post('/models/batch', b)),
  update: (id, b) => unwrap(api.put(`/models/${id}`, b)),
  remove: (id) => unwrap(api.delete(`/models/${id}`)),
  marketplace: () => unwrap(api.get('/marketplace')),
  probe: (b) => unwrap(api.post('/models/probe', b)),
  probeBatch: () => unwrap(api.post('/models/probe-batch')),
};

export const keys = {
  list: () => unwrap(api.get('/keys')),
  create: (b) => unwrap(api.post('/keys', b)),
  remove: (id) => unwrap(api.delete(`/keys/${id}`)),
};

export const billing = {
  recharge: (amount) => unwrap(api.post('/recharge', { amount })),
  recharges: () => unwrap(api.get('/recharges')),
};

export const dashboard = () => unwrap(api.get('/dashboard'));
export const logs = (p) => unwrap(api.get('/logs', { params: p }));
export const users = {
  list: () => unwrap(api.get('/users')),
  update: (id, b) => unwrap(api.put(`/users/${id}`, b)),
};

export default api;