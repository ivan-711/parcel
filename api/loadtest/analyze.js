// Load test for the paths a busy workspace hits: start a demo, read the deals,
// recalculate as inputs change, and run a sensitivity pass.
//
//   k6 run api/loadtest/analyze.js
//   K6_BASE=https://api.parceldesk.io k6 run api/loadtest/analyze.js
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.K6_BASE || 'http://127.0.0.1:8000'

export const options = {
  scenarios: {
    workspace: { executor: 'constant-vus', vus: Number(__ENV.K6_VUS || 20), duration: __ENV.K6_DURATION || '30s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:analyze}': ['p(95)<150'],
    'http_req_duration{name:deals}': ['p(95)<150'],
    'http_req_duration{name:sensitivity}': ['p(95)<400'],
  },
}

export function setup() {
  const demo = http.post(`${BASE}/v1/demo`)
  check(demo, { 'demo started': (r) => r.status === 201 })
  const token = demo.json('token')
  const deals = http.get(`${BASE}/v1/deals`, { headers: { Authorization: `Bearer ${token}` } })
  const rental = deals.json().find((d) => d.strategy === 'buy_and_hold')
  return { token, inputs: rental.inputs }
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' }
  const rent = data.inputs.operations.monthly_rent + Math.round(Math.random() * 400 - 200)
  const inputs = { ...data.inputs, operations: { ...data.inputs.operations, monthly_rent: rent } }

  const list = http.get(`${BASE}/v1/deals`, { headers, tags: { name: 'deals' } })
  check(list, { 'deals ok': (r) => r.status === 200 })

  const run = http.post(`${BASE}/v1/analyze`, JSON.stringify({ inputs, monthly: true }), { headers, tags: { name: 'analyze' } })
  check(run, { 'analyze ok': (r) => r.status === 200 && r.json('metrics.irr') !== undefined })

  if (__ITER % 5 === 0) {
    const sens = http.post(`${BASE}/v1/analyze/sensitivity`, JSON.stringify({ inputs, metric: 'irr' }), { headers, tags: { name: 'sensitivity' } })
    check(sens, { 'sensitivity ok': (r) => r.status === 200 })
  }
  sleep(0.2)
}
