function JitsContext(doc) {
    this.document = doc;

    /* FIXME: Use es6 Map if available, instead of this O(n) crap. */
    var _Map = function() {
        var keys = [], values = [];
        this.get = function(node) {
            for (var i = 0; i < keys.length; i++) {
                if (keys[i] === node) {
                    return values[i];
                }
            }
            return null;
        }
        this.set = function(node, value) {
            for (var i = 0; i < keys.length; i++) {
                if (keys[i] === node) {
                    values[i] = value;
                    return;
                }
            }
            keys.push(node);
            values.push(value);
        }
    };

    this._its_translate_map = new _Map();
    this._its_within_text_map = new _Map();

    this._NS_ITS = 'http://www.w3.org/2005/11/its';
    this._NS_ITS_FUNC = function(prefix) { return 'http://www.w3.org/2005/11/its'; }
    this._NS_XLINK = 'http://www.w3.org/1999/xlink'
    this._isnsname = function(node, ns, name) {
        return node.namespaceURI == ns && node.localName == name;
    }

    this._resolve_url = function(url, base) {
        if (url.indexOf(':') != -1) {
            return url;
        }
        if (base === undefined) {
            base = this.document.baseURI;
        }
        var pi = base.indexOf('://');
        var protocol = base.substring(0, pi + 3);
        var hi = base.indexOf('/', pi + 3);
        var host = base.substring(pi + 3, hi);
        if (url[0] == '/') {
            return protocol + host + url;
        }
        var si = base.lastIndexOf('/');
        if (si === hi) {
            return protocol + host + '/' + url;
        }
        return base.substring(0, si + 1) + url;
    }
}

JitsContext.prototype._get_its_attribute = function(node, xmlattr, htmlattr) {
    var val;
    if (this.document instanceof HTMLDocument) {
        if (node.hasAttribute(htmlattr))
            return node.getAttribute(htmlattr);
    }
    else {
        if (node.hasAttributeNS(this._NS_ITS, xmlattr))
            return node.getAttributeNS(this._NS_ITS, xmlattr);
        if (this._isnsname(node, this._NS_ITS, 'span') && node.hasAttribute(xmlattr))
            return node.getAttribute(xmlattr);
    }
    return null;
}

JitsContext.prototype.get_its_rules_version = function(rules) {
    if (!this._isnsname(rules, this._NS_ITS, 'rules')) {
        return null;
    }
    if (rules.hasAttribute('version')) {
        return rules.getAttribute('version');
    }
    for (var node = rules; node.nodeType != Node.DOCUMENT_NODE; node = node.parentNode) {
        if (node.hasAttributeNS(this._NS_ITS, 'version')) {
            return node.getAttributeNS(this._NS_ITS, 'version');
        }
    }
    return null;
}

JitsContext.prototype.apply_its_file = function(url) {
    var req = new XMLHttpRequest();
    req.overrideMimeType('application/xml');
    req.open('GET', url, false);
    req.send();
    if (req.status === 200 || req.status === 0) {
        this.apply_its_rules(req.responseXML.documentElement, url);
    }
};

JitsContext.prototype.apply_its_rules = function(rules, url) {
    if (!this._isnsname(rules, this._NS_ITS, 'rules')) {
        return;
    }
    if (rules.hasAttributeNS(this._NS_XLINK, 'href')) {
        this.apply_its_file(this._resolve_url(rules.getAttributeNS(this._NS_XLINK, 'href'), url));
        return;
    }
    var itsver = this.get_its_rules_version(rules);
    if (itsver != '1.0' && itsver != '2.0') {
        return;
    }
    for (var i = 0; i < rules.childNodes.length; i++) {
        var rule = rules.childNodes[i];
        if (rule.nodeType != Node.ELEMENT_NODE) {
            continue;
        }
        if (this._isnsname(rule, this._NS_ITS, 'translateRule')) {
            var selector = rule.getAttribute('selector');
            var resolver = rules.ownerDocument.createNSResolver(rule);
            var nodes = this.document.evaluate(selector, this.document, resolver,
                                               XPathResult.ANY_TYPE, null);
            for (var node = nodes.iterateNext(); node; node = nodes.iterateNext()) {
                this._its_translate_map.set(node, rule.getAttribute('translate'));
            }
        }
        else if (this._isnsname(rule, this._NS_ITS, 'withinTextRule')) {
            var selector = rule.getAttribute('selector');
            var resolver = rules.ownerDocument.createNSResolver(rule);
            var nodes = this.document.evaluate(selector, this.document, resolver,
                                               XPathResult.ANY_TYPE, null);
            for (var node = nodes.iterateNext(); node; node = nodes.iterateNext()) {
                this._its_within_text_map.set(node, rule.getAttribute('withinText'));
            }
        }
    }
}

JitsContext.prototype.apply_its_linked_rules = function() {
    if (this.document instanceof HTMLDocument) {
        var lrules = this.document.querySelectorAll('head > link[rel = "its-rules"]');
        for (var i = 0; i < lrules.length; i++) {
            this.apply_its_file(this._resolve_url(lrules[i].getAttribute('href')));
        }
    }
    else {
        var lrules = this.document.evaluate('//its:rules', this.document, this._NS_ITS_FUNC,
                                            XPathResult.ANY_TYPE, null);
        for (var rules = lrules.iterateNext(); rules; rules = lrules.iterateNext()) {
            this.apply_its_rules(rules, this.document.baseURI);
        }
    }
};

JitsContext.prototype.get_its_translate = function(node, attr) {
    var val;
    if (attr !== undefined) {
        val = this._its_translate_map.get(attr);
        if (val !== null) {
            return val;
        }
        return 'no';
    }
    for (var pnode = node; pnode.nodeType != Node.DOCUMENT_NODE; pnode = pnode.parentNode) {
        val = this._get_its_attribute(pnode, 'translate', 'translate');
        if (val !== null) {
            return val;
        }
        val = this._its_translate_map.get(pnode);
        if (val !== null) {
            return val;
        }
    }
    return 'yes';
};

JitsContext.prototype.get_its_within_text = function(node, attr) {
    var val;
    if (attr !== undefined) {
        return null;
    }
    val = this._get_its_attribute(node, 'withinText', 'its-within-text');
    if (val !== null) {
        return val;
    }
    val = this._its_within_text_map.get(node);
    if (val !== null) {
        return val;
    }
    return 'no';
};

JitsContext.prototype.create_test_output = function(category) {
    var getval = function(ctxt, node, attr) {
        if (category == 'translate') {
            return 'translate="' + ctxt.get_its_translate(node, attr) + '"'
        }
        else if (category == 'withinText') {
            return 'withinText="' + ctxt.get_its_within_text(node, attr) + '"'
        }
    };
    var ret = '';
    var nodes = this.document.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var path = '';
        for (var parn = node; parn.nodeType != Node.DOCUMENT_NODE; parn = parn.parentNode) {
            var num = 0;
            for (var sibn = node; sibn; sibn = sibn.previousSibling) {
                if (node.localName == sibn.localName) {
                    num++;
                }
            }
            path = '/' + parn.localName + '[' + num + ']' + path;
        }
        ret = ret + path + '\t' + getval(this, node) + '\n';
        for (var j = 0; j < node.attributes.length; j++) {
            var attr = node.attributes[j];
            ret = ret + path + '/@' + attr.localName + '\t' + getval(this, node, attr) + '\n';
        }
    }
    return ret;
};
