import { Module } from '../module.js'
import { Api } from '../api.js'
import { PaymentRequestApi } from './request.js'
import { PaymentElement } from './element.js'
import { forEach, isFunction, toArray } from '../utils.js'
import { ApiOrigin, ApiEndpoint } from '../config.js'

export const PaymentButton = Module.extend({
  defaults: {
    version: 'default',
    origin: ApiOrigin,
    endpoint: ApiEndpoint,
    methods: ['apple', 'google'],
    element: null,
    style: {
      height: 38,
      mode: 'default',
      type: 'long',
      color: 'black',
    },
    data: {
      lang: 'en',
    },
    before(defer) {
      defer.resolve()
    },
    after(defer, params) {
      defer.resolve(params)
    },
  },
  init(params) {
    this.elements = {}
    this.supported = false
    this.params = {
      element: params.element,
      version: params.version || this.defaults.version,
      methods: params.methods || this.defaults.methods,
      origin: params.origin || this.defaults.origin,
      endpoint: this.utils.extend({}, this.defaults.endpoint, params.endpoint),
      style: this.utils.extend({}, this.defaults.style, params.style),
      before: isFunction(params.before) ? params.before : this.defaults.before,
      after: isFunction(params.after) ? params.after : this.defaults.after,
      data: this.utils.extend({}, this.defaults.data, params.data),
    }
    this.initApi(params.api)
    this.initPaymentRequestApi()
    this.initElements()
    this.initData()
  },
  initData() {
    const data = this.params.data
    if (!data.merchant_id) return
    if ((!data.currency || !data.amount) && !data.token) return
    this.update()
  },
  initApi(api) {
    if (api instanceof Api) {
      this.api = api
    } else {
      this.api = new Api({
        version: this.params.version,
        origin: this.params.origin,
        endpoint: this.params.endpoint,
      })
    }
  },
  initPaymentRequestApi() {
    this.request = new PaymentRequestApi({
      before: this.params.before,
      after: this.params.after,
    })
    this.request.setApi(this.api)
    this.request.setMerchant(this.params.data.merchant_id)
    this.request.on('pending', this.proxy('onPending'))
    this.request.on('details', this.proxy('onDetails'))
    this.request.on('error', this.proxy('onError'))
    this.request.on('show', this.proxy('onShow'))
    this.request.on('hide', this.proxy('onHide'))
  },
  initElements() {
    const self = this
    const style = this.params.style
    const data = this.params.data
    const origin = this.params.origin
    const appendTo = this.params.element
    const endpoint = this.params.endpoint.element
    const request = this.request
    this.buttons = []
    this.container = this.utils.querySelector(this.params.element)
    this.addCss(this.container, {
      display: 'flex',
      gap: '1rem',
      'flex-direction': 'column',
    })
    forEach(this.params.methods, function (method) {
      const element = new PaymentElement({
        origin: origin,
        endpoint: endpoint,
        method: method,
        appendTo: appendTo,
        color: style.color,
        mode: style.mode,
        lang: data.lang,
        height: style.height,
      })
      element.setPaymentRequest(request)
      self.buttons.push(element)
    })
    request.getSupportedMethods()
  },
  update(data) {
    return this.request.update(this.utils.extend(this.params.data, data || {}))
  },
  onDetails(_cx, data) {
    this.api.scope(() => {
      this.request.after(this.params.data).done((extendParams) => {
        this.api
          .request(
            'api.checkout.form',
            'request',
            this.utils.extend({}, this.params.data, extendParams || {}, data)
          )
          .done(this.proxy('onSuccess'))
          .fail(this.proxy('onError'))
      })
    })
  },
  onSuccess(_cx, data) {
    this.trigger('success', data)
  },
  onError(_cx, data) {
    this.trigger('error', data)
  },
  toggleEventType(state, complete) {
    return state ? (complete ? 'shown' : 'show') : complete ? 'hidden' : 'hide'
  },
  toggleEventNamespace(state, data) {
    const name = []
    name.push(this.toggleEventType(state, data.complete))
    name.push(data.method)
    return name.join(':')
  },
  triggerEventComplete(state, data) {
    const complete = data.complete
    const name = this.toggleEventType(state, complete)
    const check = this.buttons
      .filter((i) => i.isMounted())
      .every((i) => i.getState(state, complete))
    if (check) this.trigger(name, {})
  },
  onShow(_cx, data) {
    this.trigger(this.toggleEventNamespace(true, data), {})
    this.triggerEventComplete(true, data)
  },
  onHide(_cx, data) {
    this.trigger(this.toggleEventNamespace(false, data), {})
    this.triggerEventComplete(false, data)
  },
  onPending(_cx, state) {
    this.trigger('pending', state)
  },
})
