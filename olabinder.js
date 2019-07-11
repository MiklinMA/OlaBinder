/*
 * Mike Miklin <MiklinMA@gmail.com>
 * 2018
 */
"use-strict"

var Binder = function (base) {
    let __data = {}
    let __bindings = {}
    let __prefix = 'pp'
    let __lang_dict = {}

    const common = {
        // makes string ready to be attribute
        string_to_attribute: (...args) => {
            let key = args.join('-')
            key = key.replace(/^\$./, '')
            key = key.replace(/[\._]/g, '-')
            key = key.replace(/[\[\]\']/, '-')
            key = __prefix+'-id-'+key
            return key
        },
        // skip all attributes except custom
        // like pp-class or pp-if
        check_attribute: (attr) => {
            if (attr.name.indexOf(__prefix)) return
            if (!attr.name.indexOf(__prefix+'-id')) return
            if (!attr.name.indexOf(__prefix+'-tmp')) return
            return true
        }
    }

    const regex = {
        unquoted: (string, callback) => {
            return string.replace(/([\$\.\w]+)(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/g, callback)
        },
        moustaches: (string, callback) => {
            if (callback) return string.replace( /{{([^}]*)}}/g, callback)
            return (string.search( /{{([^}]*)}}/g) != -1)
        },
        unquoted_moustaches: (string, callback) => {
            return regex.moustaches(string, (template, expression) =>
                regex.unquoted(expression, callback)
            )
        },
        get_repeat_vars: (string) => {
            let ms = string.match(/([\w]+) in ([\$\.\w]+)/)
            if (ms.length != 3) throw "Wrong repeat string"

            let rvs= {}
            rvs.block = ms[1]
            rvs.list = ms[2]
            rvs.data = eval(ms[2].replace(/^\$\./, '__data.'))
            return rvs
        }
    }

    /*
     * ELEMENT
     */
    // update model name recursively
    const element_rebase_model = (element, src, dst) => {
        if (!dst) return

        // replace src in brackets with dst
        const update_model = (value) => {
            const update_varsonly = (value) => {
                element.removeAttribute(common.string_to_attribute(value))
                return regex.unquoted(value,
                    varsonly => varsonly.replace(src, dst)
                )
            }

            if (!value.trim()) return ''

            if (regex.moustaches(value)) {
                return regex.moustaches(value,
                    (template, expression) => '{{'+update_varsonly(expression)+'}}'
                )
            } else {
                return update_varsonly(value)
            }
        }
        // replace model in attributes
        Array.from(element.attributes).forEach(
            (attr, i) => {
                if (!common.check_attribute(attr)) return
                element.setAttribute(attr.name, update_model(attr.value))
            }
        )
        Array.from(element.childNodes).forEach(node => {
            if (node.nodeName == '#comment') return
            if (node.nodeName == '#text') {
                // replace model in text nodes
                node.nodeValue = update_model(node.nodeValue)
            } else {
                // recursive go through children nodes
                element_rebase_model(node, src, dst)
            }
        })
    }
    // recursive goes through elements
    // and update bindings
    var html_counter = 0
    const el = function(element) {
        const update_bindings_recursive = () => {
            // set bindings for each variable in attributes
            if (el(element).update_attribute_bindings() === false) return

            el(element).reset()

            Array.from(element.childNodes).forEach(node => {
                if (node.nodeName == '#comment') return
                if (node.nodeName == '#text') {
                    node.nodeValue = regex.unquoted_moustaches(
                        node.nodeValue,
                        varsonly => binding.update(element, varsonly)
                    )
                    return
                }
                // recursive go through children nodes
                el(node).update_bindings_recursive()
            })
            // set initial values
            el(element).set_value_of_binding()
        }
        const update_attribute_bindings = () => {
            return !Array.from(element.attributes).some((attr, i) => {
                if (!common.check_attribute(attr)) return

                if (attr.name == __prefix+'-if') {
                    regex.unquoted(
                        attr.value,
                        expression => binding.update(element, expression)
                    )
                }
                if (attr.name == __prefix+'-repeat') {
                    let rvs
                    element.style.display = 'none'
                    try {
                        rvs = regex.get_repeat_vars(attr.value)
                    } catch(e) {
                        return true
                    }
                    element.style.display = ''
                    element.removeAttribute(__prefix+'-repeat')

                    let original = element.cloneNode(true) // binding.get_original_element(element)

                    element.innerHTML = ''

                    rvs.data && rvs.data.forEach((block, index) => {
                        let clone = original.cloneNode(true)

                        element_rebase_model(clone, rvs.block, rvs.list+'.'+index)
                        el(clone).update_bindings_recursive()

                        while(clone.children.length) element.appendChild(clone.firstChild)
                    })
                }
                regex.moustaches(
                    attr.value,
                    (template, expression) => {
                        if (expression) binding.update(element, expression)
                    }
                )
            })
        }
        // if element value contains HTML tags
        // creates elements in parent node
        const create_html_elements_from_value = () => {
            const make_element = (html, parentTextNodeIndex) => {
                let sub = document.createElement('sub')
                sub.innerHTML = html || ''
                sub = sub.firstChild
                sub.setAttribute(__prefix+'-tmp-text-node', parentTextNodeIndex)
                return sub
            }
            html_counter++
            Array.from(element.childNodes).forEach((node, i) => {
                if (node.nodeName != '#text') return
                let s = node.nodeValue
                let next = node.nextSibling

                let ms = s.match(/<[^>]*>[^<]*<\/[^>]*>/g)
                if (!ms) return

                node.nodeValue = ''
                ms.forEach(html => {
                    s = s.split(html)
                    element.insertBefore(document.createTextNode(s[0]), next)
                    element.insertBefore(make_element(html, i), next)
                    s = s[1]
                })
                element.insertBefore(document.createTextNode(s), next)
            })
        }
        // sets value in places of bindings
        const set_value_of_binding = () => {
            let original = binding.get_original_element(element)

            const prepare_expression = (expression) => {
                return regex.unquoted(expression,
                    varsonly => {
                        let res = []
                        varsonly.split('.').forEach((part, i) => {
                            if (part == '$') res.push('.__data')
                            else if (!part.search(/\d+/)) res.push('['+part+']')
                            else res.push('.'+part)
                        })
                        varsonly = res.join('')
                        if (varsonly[0] == '.') varsonly = varsonly.slice(1)
                        return varsonly
                    }
                )
            }

            const replace = (template, expression) => {
                if (!expression) expression = template
                expression = prepare_expression(expression)

                // console.log('replacer', template, expression)
                let res = ''
                try {
                    res = eval(expression)
                } catch(e) {
                    // res = template
                }
                return res
            }

            Array.from(element.childNodes).forEach((node, i) => {
                if (node.nodeName != '#text') return
                if (!original.childNodes[i]) return
                node.nodeValue = regex.moustaches(
                    original.childNodes[i].nodeValue,
                    replace
                )
                if (node.nodeValue.search(/[{}]/) != -1) {
                    node.nodeValue = regex.moustaches(
                        node.nodeValue,
                        replace
                    )
                }
            })

            el(element).create_html_elements_from_value()

            Array.from(element.attributes).forEach((attr, i) => {
                if (!common.check_attribute(attr)) return

                attr.value = regex.moustaches(
                    original.attributes[attr.name].value,
                    replace
                )

                if (attr.name == __prefix+'-if') {
                    let res = prepare_expression(attr.value)
                    try {
                        res = Boolean(eval(res))
                    } catch (e) {
                        console.warn('IF eval fail:', res)
                    }
                    if (typeof res == 'boolean' || res == '') {
                        if (res)
                            element.style.display = ''
                        else
                            element.style.display = 'none'
                    }
                }

                // if attribute was not cleared do not set class and src
                if (attr.value.search(/[{}]/) != -1) return

                if (attr.name == __prefix+'-class') {
                    element.className = original.className
                    return element.classList.add(attr.value)
                }

                if (attr.name == __prefix+'-src')
                    return element.setAttribute('src', attr.value)
            })
        }
        const reset = () => {
            let original = binding.get_original_element(element)
            if (element.childNodes.length != original.childNodes.length) {
                element.innerHTML = original.innerHTML || ''
                /*
                element.querySelectorAll('['+__prefix+'-tmp-text-node]').forEach(tmp => tmp.remove())
                */
            }
        }
        return {
            update_bindings_recursive: update_bindings_recursive,
            update_attribute_bindings: update_attribute_bindings,
            create_html_elements_from_value: create_html_elements_from_value,
            set_value_of_binding: set_value_of_binding,
            reset: reset
        }
    }

    /*
     * BINDINGS
     */

    const binding = {
        // find given element in bindings
        // - read element attribute given by key
        // - scan all element attributes and find already bound element
        // if found: returns saved element
        // if not: returns null
        get_saved_element: (element, key) => {
            let saved
            if (key) {
                if (!__bindings[key]) {
                    __bindings[key] = []
                } else {
                    let i = element.getAttribute(key)
                    if (i != null) {
                        saved = __bindings[key][i]
                    }
                }
            }
            if (!saved) {
                Array.from(element.attributes).some(a => {
                    if (a.name.indexOf(__prefix+'-id-')) return
                    saved = __bindings[a.name][a.value]
                    return true
                })
            }
            return saved || null
        },

        // find given element in bindings
        // if found: clone saved element
        // if not: save element and set it's attribute
        update: (element, key) => {
            key = common.string_to_attribute(key)

            let saved = binding.get_saved_element(element, key)

            if (saved && saved.hasAttribute(key)) {
                element = saved.cloneNode(true)
            } else {
                saved = saved || element.cloneNode(true)

                let i = __bindings[key].push(saved)
                i -= 1
                element.setAttribute(key, i)
                saved.setAttribute(key, i)
            }
        },

        // returns copy of original element
        get_original_element: (element, key) => {
            let saved = binding.get_saved_element(element, key)
            return saved
                && saved.cloneNode(true)
                || element.cloneNode(true)
        },
    }

    const pub = {
        reload: async (module, callback, nonsync) => {
            let attr = __prefix+'-'+module
            let query = '['+attr+']'
            let res = false
            if (!module) {
                module = attr = query = 'body'
            }
            let es = Array.from(document.querySelectorAll(query))
            for (let i = 0; es && i < es.length; i++) {
                let element = es[i]
                if (callback) {
                    if (nonsync) await callback(element)
                    else callback(element)
                }

                el(element).update_bindings_recursive()
                res = true
            }
            return res
        },

        bind: (base, key, obj) => {
            // obj = obj || eval(key)
            const apply = (attr) => {
                Array.from(document.querySelectorAll('['+attr+']')).forEach(element => {
                    // console.debug('Apply', attr, element.tagName, element.className)
                    el(element).set_value_of_binding()
                })
            }

            __data[key] = new Proxy(obj, {
                get(t, k) {
                    // return t[k]
                    return translate(__lang_dict, key, k, t[k])
                },
                set(t, k, v) {
                    t[k] = v
                    // t[k] = translate(__lang_dict, key, k, v)
                    return true
                }
            })

            if (base[key]) {
                /*
                Object.keys(__data).forEach(root_key => {
                    Object.keys(__data[root_key]).forEach(k => {
                        let value = __data[root_key][k]
                        if (Array.isArray(value)) {
                            value.forEach((z, i) => {
                                apply(common.string_to_attribute(root_key, k, i))
                            })
                        } else if (value && typeof value == 'object') {
                            Object.keys(value).forEach((z, i) => {
                                apply(common.string_to_attribute(k, z))
                            })
                        } else {
                            apply(common.string_to_attribute(root_key, k))
                        }
                    })
                })
                */
                pub.reload()
                return base[key]
            }

            base[key] = new Proxy(__data[key], {
                get(t, k) { return t[k] },
                set(t, k, v) {
                    t[k] = v
                    apply(common.string_to_attribute(key, k))
                    return true
                }
            })
            pub.reload(key)
            return base[key]
        }
    }

    const translate = (lang_dict, ...args) => {
        let sub = lang_dict
        let found = false
        let value = args[args.length-1]

        for (let i = 0; i < args.length; i++) {
            let arg = args[i]
            if (sub[arg] == undefined) {
                found = Array.isArray(value)
                break
            }
            sub = sub[arg]
            if (typeof sub == 'string') {
                found = true
                break
            }
        }
        if (!found) {
            // console.log('TRANSLATE NOT FOUND', value)
            return value
        }
        if (typeof sub == 'string') {
            console.log('TRANSLATE STRING', sub)
            return sub
        }
        if (!Array.isArray(value)) return value

        // console.log('TRANSLATE ARGS', args, value.length)

        for (let i = 0; i < value.length; i++) {
            Object.keys(value[i]).some(k => {
                let v = value[i][k]
                if (sub[k] == undefined) return true
                // console.log('TRANSLATE PRE:', sub[k], v)
                if (sub[k][v] == undefined) return false

                // console.log('TRANSLATE SUB:', k, sub[k][v])
                value[i][k] = sub[k][v]
            })
        }

        return value
    }

    pub.reload()
    return new Proxy(base || {}, {
        get(t, k) {
            if (k == 'reload') return pub.reload
            if (k == '__bindings') {
                let res = {}
                Object.keys(__bindings).forEach(key => {
                    res[key] = []
                    __bindings[key].forEach(element => {
                        res[key].push({
                            attributes: element.attributes,
                            children: element.childNodes,
                        })
                    })
                })
                return res
            }
            if (k == '__data') return __data
            return t[k]
        },
        set(t, k, v) {
            if (k == 'lang') __lang_dict = v
            return pub.bind(t, k, v)
        }
    })
}


