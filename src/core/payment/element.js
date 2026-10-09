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
      isSupported: false,
      isAllowed: false,
      isMounted: false,
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
    if (this.pending) return false
    this.send('event', { type: ev.type })
  },
  onClick() {
    if (this.pending) return false
    this.request.before().done(this.proxy('onClickDone')).fail(this.proxy('onClickFail'))
  },
  onClickDone() {
    this.request.pay(this.params.method)
  },
  onClickFail() {},
  onSupported(cx, supported) {
    this.state.isSupported = supported.provider.includes(this.params.method)
    this.render()
  },
  onPayload(cx, payload) {
    this.state.isAllowed = payload.allowed.includes(this.params.method)
    this.render()
  },
  onPending(cx, state) {
    this.pending = state
    this.addCss(this.element, {
      transition: 'height 0.2s ease-out, opacity 0.4s ease-out',
      pointerEvents: this.pending ? 'none' : '',
      opacity: this.pending ? '0.5' : '1',
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
    this.request = request
    const onSupported = this.proxy('onSupported')
    const onPayload = this.proxy('onPayload')
    const onPending = this.proxy('onPending')
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
    if (this.state.isSupported === false) return this.hide()
    if (this.state.isAllowed === false) return this.hide()
    this.mount()
    this.show()
  },
  notMounted() {
    return document.body.contains(this.element) === false
  },
  unmount() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    return this
  },
  mount() {
    if (this.notMounted()) {
      this.appendTo(this.params.appendTo)
    }
    return this
  },
  transitionValue(value) {
    return value
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
  getTimeoutValue() {
    return toArray(arguments).map(transitionDelay).sort().pop()
  },
  afterCallback(state) {
    if (this.currentState === state) return
    if (this.transitionPending) return
    this.transitionPending = true
    this.currentState = state
    this.request.trigger(this.currentState, { complete: false, method: this.params.method })
    this.timeout('afterTransition', this.getTimeoutValue(this.iframe, this.element))
  },
  afterTransition() {
    this.transitionPending = false
    this.request.trigger(this.currentState, { complete: true, method: this.params.method })
  },
})
