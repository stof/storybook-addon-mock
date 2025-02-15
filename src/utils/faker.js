/* eslint-disable no-restricted-globals */
import { newMockXhr } from 'mock-xmlhttprequest';
import { match } from 'path-to-regexp';
import { Request } from './request';
import { Response } from './response';
import { arrayEquals } from './array';
import { getNormalizedUrl } from './url';

let global =
    // eslint-disable-next-line no-undef
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof self !== 'undefined' && self) ||
    (typeof global !== 'undefined' && global) ||
    {};

export class Faker {
    constructor() {
        this.MockXhr = newMockXhr();
        this.MockXhr.onSend = this.mockXhrRequest;

        global.realFetch = global.fetch;
        global.realXMLHttpRequest = global.XMLHttpRequest;

        global.fetch = this.mockFetch;
        global.XMLHttpRequest = this.MockXhr;

        this.requestMap = {};
    }

    getRequests = () => Object.values(this.requestMap);

    getKey = (url = '', searchParamKeys = [], method = 'GET') =>
        url && method
            ? [url, ...searchParamKeys, method.toLowerCase()].join('_')
            : '';

    makeInitialRequestMap = (requests) => {
        if (!requests || !Array.isArray(requests)) {
            return;
        }

        this.restore();
        requests.forEach((request) => {
            this.add(request);
        });
    };

    add = (request) => {
        const { path, searchParamKeys } = getNormalizedUrl(request.url);
        const key = this.getKey(path, searchParamKeys, request.method);
        this.requestMap[key] = {
            ...request,
            path,
            searchParamKeys,
            method: request.method || 'GET',
            status: request.status || 200,
            delay: request.delay || 0,
            skip: false,
        };
    };

    update = (item, fieldKey, value) => {
        const { url, method } = item;
        const { path, searchParamKeys } = getNormalizedUrl(url);
        const itemKey = this.getKey(path, searchParamKeys, method);

        if (
            // eslint-disable-next-line no-prototype-builtins
            this.requestMap.hasOwnProperty(itemKey) &&
            // eslint-disable-next-line no-prototype-builtins
            this.requestMap[itemKey].hasOwnProperty(fieldKey)
        ) {
            this.requestMap[itemKey][fieldKey] = value;
        }
    };

    matchMock = (url, method = 'GET') => {
        const { path, searchParamKeys } = getNormalizedUrl(url);

        for (let key in this.requestMap) {
            const { url: requestUrl, method: requestMethod } =
                this.requestMap[key];
            const { path: requestPath, searchParamKeys: requestSearchKeys } =
                getNormalizedUrl(requestUrl);
            if (
                match(requestPath)(path) &&
                method == requestMethod &&
                arrayEquals(searchParamKeys, requestSearchKeys) &&
                !this.requestMap[key].skip
            ) {
                return this.requestMap[key];
            }
        }

        return null;
    };

    mockFetch = (input, options) => {
        const request = new Request(input, options);
        const { url, method } = request;
        const matched = this.matchMock(url, method);

        if (matched) {
            const { response, status, delay = 0 } = matched;
            return new Promise((resolve) => {
                setTimeout(() => {
                    if (typeof response === 'function') {
                        resolve(new Response(url, status, response(request)));
                    } else {
                        resolve(new Response(url, status, response));
                    }
                }, +delay);
            });
        }
        // eslint-disable-next-line no-restricted-globals
        return global.realFetch(input, options);
    };

    mockXhrRequest = (xhr) => {
        const { method, url } = xhr;
        const matched = this.matchMock(url, method);
        if (matched) {
            const { response, status, delay = 0 } = matched;
            setTimeout(() => {
                if (typeof response === 'function') {
                    const data = response(
                        new Request(url, { method, body: xhr.body })
                    );
                    xhr.respond(status, {}, data);
                } else {
                    xhr.respond(+status, {}, response);
                }
            }, +delay);
        } else {
            // eslint-disable-next-line new-cap
            const realXhr = new global.realXMLHttpRequest();
            realXhr.open(method, url);

            realXhr.onreadystatechange = function onReadyStateChange() {
                if (realXhr.readyState === 4 && realXhr.status === 200) {
                    xhr.respond(200, {}, this.responseText);
                }
            };

            realXhr.send();

            const errorHandler = function () {
                return 'Network failed';
            };

            realXhr.onerror = errorHandler;
            realXhr.ontimeout = errorHandler;
        }
    };

    restore = () => {
        this.requestMap = {};
    };
}

export default new Faker();
