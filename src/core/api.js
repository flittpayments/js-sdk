import { Deferred } from './deferred.js'
import { Module } from './module.js'
import { Connector } from './connector.js'
import { Modal } from './modal.js'
import { Response } from './response.js'
import { ApiFrameCss, ApiOrigin, ApiEndpoint } from './config.js'
import { buildUrl } from './utils.js'

export const Api = Module.extend({
  defaults: {
    version: 'default',
    origin: ApiOrigin,
    endpoint: ApiEndpoint,
    container: 'body',
    messages: {
      modalHeader:
        'Now you will be redirected to your bank 3DSecure. If you are not redirected please refer',
      modalLinkLabel: 'link',
    },
  },
  init(params) {
    this.initParams(params)
  },
  url(type, url) {
    return buildUrl(this.params.origin, this.params.endpoint[type], {
      version: this.params.version,
      origin: location.origin,
    })
  },
  extendParams(params) {
    this.utils.extend(this.params, params)
    return this
  },
  initParams(params) {
    this.iframeDeferred = Deferred()
    this.params = this.utils.extend({}, this.defaults)
    this.extendParams(params)
    this.setOrigin(this.params.origin)
  },
  setOrigin(origin) {
    if (this.utils.isString(origin)) {
      this.params.origin = origin
    }
    return this
  },
  scope(callback) {
    callback = this.proxy(callback)
    this.domReady(function () {
      this.createFrame()
      if (this.iframeDeferred.isPending()) {
        this.iframeDeferred.done(callback)
      } else {
        callback()
      }
    })
  },
  domReady(callback) {
    callback = this.proxy(callback)
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', callback)
    } else {
      callback()
    }
  },
  request(model, method, params) {
    const defer = Deferred()
    const data = {
      uid: this.connector.getUID(),
      action: model,
      method: method,
      params: params || {},
    }
    this.connector.send('request', data)
    this.connector.on(
      data.uid,
      this.proxy(function (ev, response, model, action) {
        const responseModel = new Response(response)
        responseModel.setUID(data.uid)
        responseModel.setConnector(this.connector)
        action = 'resolveWith'
        if (responseModel.attr('submit3ds')) {
          action = 'notifyWith'
        }
        if (responseModel.attr('error')) {
          action = 'rejectWith'
        }
        defer[action](this, [responseModel])
      })
    )
    return defer
  },
  createFrame() {
    if (this.iframe) return this
    this.iframe = this.utils.createElement('iframe')
    this.addAttr(this.iframe, {
      allowtransparency: true,
      frameborder: 0,
      scrolling: 'no',
    })
    this.addAttr(this.iframe, { src: this.url('gateway') })
    this.addCss(this.iframe, ApiFrameCss)
    if (this.utils.isElement(this.params.container)) {
      this.container = this.params.container
    }
    if (this.utils.isString(this.params.container)) {
      this.container = this.utils.querySelector(this.params.container)
    }
    if (this.container) {
      if (this.container.firstChild) {
        this.container.insertBefore(this.iframe, this.container.firstChild)
      } else {
        this.container.appendChild(this.iframe)
      }
      this.connector = new Connector({
        target: this.iframe.contentWindow,
        origin: this.params.origin,
      })
      this.connector.on('load', this.proxy('onLoadConnector'))
      this.connector.on('modal', this.proxy('onOpenModal'))
    } else {
      throw Error(`container element not found: document.querySelector("${this.params.container}")`)
    }
    return this
  },
  onOpenModal(xhr, model) {
    this.modal = new Modal({ checkout: this, model: model })
    this.modal.on('close', this.proxy('onCloseModal'))
  },
  onCloseModal(modal, data) {
    this.trigger('modal.close', modal, data)
  },
  onLoadConnector() {
    this.iframeDeferred.resolve(true)
    this.connector.off('load')
  },
})
