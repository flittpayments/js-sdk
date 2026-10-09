import { Module } from '../module.js'
import { Connector } from '../connector.js'
import {
  ApiOrigin,
  ApiEndpoint,
  ButtonContainerCss,
  ButtonCoverCss,
  ButtonCoverAttrs,
  ButtonFrameCss,
  ButtonFrameAttrs,
} from '../config.js'

import { transitionDelay, toArray } from '../utils.js'

import { PaymentRequestApi } from './request.js'

export const PaymentElement = Module.extend({
  defaults: {
    method: null,
    appendTo: null,
    className: 'payment-element',
    origin: ApiOrigin,
    endpoint: ApiEndpoint.element,
    mode: 'plain',
    color: 'black',
    lang: 'en',
    height: 38,
  },
  init(params) {
    this.state = {
      type: 'hide',
      transition: false,
      pending: false,
      mounted: false,
      supported: false,
      allowed: false,
    }
    this.params = {}
    this.utils.extend(this.params, this.defaults)
    this.utils.extend(this.params, params)
    this.initElement()
  },
  timeout(callback, timeout) {
    this.timeoutMap = this.timeoutMap || {}
    clearTimeout(this.timeoutMap[timeout])
    this.timeoutMap[callback] = setTimeout(this.proxy(callback), timeout)
    return this
  },
  getElementUrl() {
    return [this.params.origin, this.params.endpoint].join('')
  },
  getElementOptions() {
    return this.utils.param({
      method: this.params.method,
      mode: this.params.mode,
      style: this.params.style,
      color: this.params.color,
      lang: this.params.lang,
    })
  },
  initElement() {
    this.element = this.utils.createElement('div')
    this.iframe = this.utils.createElement('iframe')
    this.button = this.utils.createElement('a')
    this.addCss(this.element, ButtonContainerCss)
    this.addCss(this.button, ButtonCoverCss)
    this.addAttr(this.button, ButtonCoverAttrs)
    this.addCss(this.iframe, ButtonFrameCss)
    this.addAttr(this.iframe, ButtonFrameAttrs)
    this.addAttr(this.iframe, {
      src: [this.getElementUrl(), this.getElementOptions()].join('?'),
    })
    this.addEvent(this.iframe, 'load', 'onloadConnector')
    this.addEvent(this.iframe, 'error', 'errorConnector')
    this.addAttr(this.element, {
      class: this.params.className,
    })
    this.element.appendChild(this.iframe)
    this.element.appendChild(this.button)
  },
  errorConnector() {},
  onloadConnector() {
    this.connector = new Connector({
      target: this.iframe.contentWindow,
      origin: this.params.origin,
    })
  },
  send(action, data) {
    if (this.connector) {
      this.connector.send(action, data)
    }
  },
  onEvent(cx, ev) {
    ev.preventDefault()
    if (this.state.pending) return false
    this.send('event', { type: ev.type })
  },
  onClick() {
    if (this.state.pending) return false
    this.request.before().done(this.proxy('onClickDone')).fail(this.proxy('onClickFail'))
  },
  onClickDone() {
    this.request.pay(this.params.method)
  },
  onClickFail() {},
  onSupported(cx, supported) {
    this.state.supported = supported.provider.includes(this.params.method)
    this.render()
  },
  onPayload(cx, payload) {
    this.state.allowed = payload.allowed.includes(this.params.method)
    this.render()
  },
  onPending(cx, state) {
    this.state.pending = state
    this.addCss(this.element, {
      transition: 'height 0.2s ease-out, opacity 0.4s ease-out',
      pointerEvents: this.state.pending ? 'none' : '',
      opacity: this.state.pending ? '0.5' : '1',
    })
  },
  initEvents() {
    this.addEvent(this.button, 'mouseenter', 'onEvent')
    this.addEvent(this.button, 'mouseleave', 'onEvent')
    this.addEvent(this.button, 'blur', 'onEvent')
    this.addEvent(this.button, 'focus', 'onEvent')
    this.addEvent(this.button, 'click', 'onClick')
  },
  setPaymentRequest(request) {
    if (!(request instanceof PaymentRequestApi))
      throw Error('request is not instance of PaymentRequestApi')
    const onSupported = this.proxy('onSupported')
    const onPayload = this.proxy('onPayload')
    const onPending = this.proxy('onPending')
    this.request = request
    this.request.off('supported', onSupported).on('supported', onSupported)
    this.request.off('payload', onPayload).on('payload', onPayload)
    this.request.off('pending', onPending).on('pending', onPending)
    return this
  },
  appendTo(appendTo) {
    const container = this.utils.querySelector(appendTo)
    if (container) container.appendChild(this.element)
    this.initEvents()
    return this
  },
  render() {
    if (this.state.supported === false) return this.hide()
    if (this.state.allowed === false) return this.hide()
    this.mount()
    this.show()
  },
  notMounted() {
    return this.state.mounted === false
  },
  isMounted() {
    return this.state.mounted === true
  },
  unmount() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
      this.state.mounted = false
    }
    return this
  },
  mount() {
    if (!document.body.contains(this.element)) {
      this.appendTo(this.params.appendTo)
      this.state.mounted = true
    }
    return this
  },
  transitionValue(value) {
    return value
  },
  getTimeoutValue() {
    return toArray(arguments).map(transitionDelay).sort().pop()
  },
  getState(state, transition) {
    return this.state.type === (state ? 'show' : 'hide') && this.state.transition === transition
  },
  triggerState() {
    this.request.trigger(this.state.type, {
      transition: this.state.transition,
      method: this.params.method,
    })
  },
  show() {
    if (this.notMounted()) return
    this.timeout('showCallback', 25)
    return this
  },
  hide() {
    if (this.notMounted()) return
    this.timeout('hideCallback', 25)
    return this
  },
  showCallback() {
    this.addCss(this.element, {
      transition: this.transitionValue('height 0.2s ease-out'),
      height: this.utils.cssUnit(this.params.height, 'px'),
      'will-change': 'height',
    })
    this.addCss(this.iframe, {
      transition: this.transitionValue('opacity 0.225s 0.225s ease-out'),
      opacity: this.utils.cssUnit(1),
      'will-change': 'opacity',
    })
    this.afterCallback('show')
  },
  hideCallback() {
    this.addCss(this.element, {
      transition: this.transitionValue('height 0.225s 0.225s ease-out'),
      height: this.utils.cssUnit(0, 'px'),
      'will-change': 'height',
    })
    this.addCss(this.iframe, {
      transition: this.transitionValue('opacity 0.225s ease-out'),
      opacity: this.utils.cssUnit(0),
      'will-change': 'opacity',
    })
    this.afterCallback('hide')
  },
  afterCallback(state) {
    if (this.state.type === state) return
    if (this.state.transition) return
    this.state.transition = true
    this.state.type = state
    this.triggerState()
    this.timeout('afterTransition', this.getTimeoutValue(this.iframe, this.element))
  },
  afterTransition() {
    this.state.transition = false
    this.triggerState()
  },
})
