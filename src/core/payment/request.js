import { Module } from '../module.js'
import { Api } from '../api.js'
import { Deferred } from '../deferred.js'
import { forEach, getAppleSessionConfig, isFunction, loadExternalApi } from '../utils.js'
import { PaymentMethodsConfig } from '../config.js'

let supportedMethodsDeferred = null

const getSupportedMethods = () => {
  if (supportedMethodsDeferred) return supportedMethodsDeferred
  supportedMethodsDeferred = Deferred()
  const promises = []
  const supported = { provider: [] }
  forEach(PaymentMethodsConfig, (method) => {
    promises.push(
      loadExternalApi(method.url, method.path)
        .then(method.callback)
        .then((state) => {
          if (state) {
            supported.provider.push(method.name)
          } else {
            console.log('payment method is not supported', method.name)
          }
        })
    )
  })
  Promise.all(promises).finally(() => {
    supportedMethodsDeferred.resolve(supported)
  })
  return supportedMethodsDeferred
}

export const PaymentRequestApi = Module.extend({
  config: {
    payment_system: '',
    fallback: false,
    methods: [],
    details: {},
    options: {},
  },
  supported: {
    fallback: false,
    provider: [],
  },
  payload: {
    payment_system: null,
    provider: [],
  },
  params: {},
  getSupportedMethods() {
    return getSupportedMethods().then((supported) => {
      this.setSupported(supported)
      return supported
    })
  },
  init(params) {
    this.params = params || {}
  },
  setSupported(supported) {
    this.supported = supported
    this.trigger('supported', supported)
    return this
  },
  setPayload(payload) {
    this.payload = payload
    this.trigger('payload', payload)
    return this
  },
  setMerchant(merchant) {
    this.merchant = merchant
  },
  setBeforeCallback(beforeCallback) {
    if (isFunction(beforeCallback)) {
      this.params.before = beforeCallback
    }
  },
  setAfterCallback(afterCallback) {
    if (isFunction(afterCallback)) {
      this.params.after = afterCallback
    }
  },
  setApi(api) {
    if (api instanceof Api) this.api = api
    return this
  },
  getProviderPayload(method) {
    return this.payload.provider[method] || {}
  },
  isMethodSupported(method) {
    return this.supported.provider.indexOf(method) !== -1
  },
  isFallbackMethod(method) {
    return method === 'google' && this.supported.fallback
  },
  request(model, method, params, success, failure) {
    const context = this
    if (context.api) {
      context.api.scope(function () {
        context.api.request(model, method, params).done(success).fail(failure)
      })
    }
  },
  session(params) {
    const defer = Deferred()
    this.request(
      'api.checkout.pay',
      'session',
      params,
      function (model) {
        defer.resolve(model.serialize())
      },
      function (model) {
        defer.reject(model)
      }
    )
    return defer
  },
  update(data) {
    if (this.isPending()) return
    this.setPending(true)
    this.params.data = data
    this.defer = Deferred()
    this.request(
      'api.checkout.pay',
      'methods',
      this.params.data,
      this.proxy(function (_cx, model) {
        this.setPending(false)
        this.setPayload(model.serialize())
        this.defer.resolve(model)
      }),
      this.proxy(function (_cx, model) {
        this.setPending(false)
        this.trigger('error', model.serialize())
        this.defer.reject(model)
      })
    )
    return this.defer
  },
  isPending() {
    return this.pendingState === true
  },
  setPending(state) {
    if (this.pendingState !== state) {
      this.pendingState = state
      this.trigger('pending', state)
    }
  },
  before() {
    if (this.isPending()) return
    this.setPending(true)
    const defer = Deferred()
    const context = this
    defer.always(function () {
      context.setPending(false)
    })
    this.params.before(defer)
    return defer
  },
  after(params) {
    const defer = Deferred()
    this.params.after(defer, params)
    return defer
  },
  withApplePay(response, config) {
    const sessionConfig = getAppleSessionConfig(config)
    const request = new ApplePaySession(sessionConfig.version, sessionConfig)
    const merchant = this.merchant
    const context = this
    request.onvalidatemerchant = function (event) {
      context
        .session({
          url: event.validationURL,
          domain: location.host,
          merchant_id: merchant,
        })
        .done((session) => {
          try {
            request.completeMerchantValidation(session.data)
          } catch (error) {
            response.reject({ code: error.code, message: error.message })
          }
        })
    }
    request.oncancel = function () {
      response.reject({ code: 20, message: 'cancel' })
    }
    request.onpaymentauthorized = function (event) {
      request.completePayment(ApplePaySession.STATUS_SUCCESS)
      response.resolve(event.payment)
    }
    request.begin()
  },
  withGooglePay(response, config) {
    const { methods } = config
    const method = methods.find((item) => item.supportedMethods === 'https://google.com/pay')
    const client = new google.payments.api.PaymentsClient({ environment: method.data.environment })
    client
      .loadPaymentData(method.data)
      .then((paymentData) => {
        response.resolve(paymentData)
      })
      .catch((error) => {
        response.reject({ code: error.code, message: error.message })
      })
  },
  pay(method) {
    if (this.isPending()) return
    this.setPending(true)
    const context = this
    const response = Deferred()
    const payload = this.getProviderPayload(method)
    response.always(function () {
      context.setPending(false)
    })
    switch (method) {
      case 'google':
        this.withGooglePay(response, payload)
        break
      case 'apple':
        this.withApplePay(response, payload)
        break
    }
    return response
      .done(function (data) {
        context.trigger('details', {
          payment_system: context.payload.payment_system,
          data,
        })
      })
      .fail(function (error) {
        context.trigger('error', error)
      })
  },
})
