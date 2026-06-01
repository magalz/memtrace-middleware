// k6 stress test for ring buffer
// Run: k6 run load/ring-buffer-stress.js
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  scenarios: {
    ring_buffer_stress: {
      executor: 'constant-arrival-rate',
      rate: 100000,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.999'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const payload = JSON.stringify({ value: `item-${Date.now()}-${Math.random()}` });
  const res = http.post(`${BASE_URL}/api/ring-buffer/push`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
