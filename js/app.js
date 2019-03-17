/**
 * Owl Carousel v2.2.1
 * Copyright 2013-2017 David Deutsch
 * Licensed under  ()
 */
/**
 * Owl carousel
 * @version 2.1.6
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 * @todo Lazy Load Icon
 * @todo prevent animationend bubling
 * @todo itemsScaleUp
 * @todo Test Zepto
 * @todo stagePadding calculate wrong active classes
 */
;
(function($, window, document, undefined) {

    /**
     * Creates a carousel.
     * @class The Owl Carousel.
     * @public
     * @param {HTMLElement|jQuery} element - The element to create the carousel for.
     * @param {Object} [options] - The options
     */
    function Owl(element, options) {

        /**
         * Current settings for the carousel.
         * @public
         */
        this.settings = null;

        /**
         * Current options set by the caller including defaults.
         * @public
         */
        this.options = $.extend({}, Owl.Defaults, options);

        /**
         * Plugin element.
         * @public
         */
        this.$element = $(element);

        /**
         * Proxied event handlers.
         * @protected
         */
        this._handlers = {};

        /**
         * References to the running plugins of this carousel.
         * @protected
         */
        this._plugins = {};

        /**
         * Currently suppressed events to prevent them from beeing retriggered.
         * @protected
         */
        this._supress = {};

        /**
         * Absolute current position.
         * @protected
         */
        this._current = null;

        /**
         * Animation speed in milliseconds.
         * @protected
         */
        this._speed = null;

        /**
         * Coordinates of all items in pixel.
         * @todo The name of this member is missleading.
         * @protected
         */
        this._coordinates = [];

        /**
         * Current breakpoint.
         * @todo Real media queries would be nice.
         * @protected
         */
        this._breakpoint = null;

        /**
         * Current width of the plugin element.
         */
        this._width = null;

        /**
         * All real items.
         * @protected
         */
        this._items = [];

        /**
         * All cloned items.
         * @protected
         */
        this._clones = [];

        /**
         * Merge values of all items.
         * @todo Maybe this could be part of a plugin.
         * @protected
         */
        this._mergers = [];

        /**
         * Widths of all items.
         */
        this._widths = [];

        /**
         * Invalidated parts within the update process.
         * @protected
         */
        this._invalidated = {};

        /**
         * Ordered list of workers for the update process.
         * @protected
         */
        this._pipe = [];

        /**
         * Current state information for the drag operation.
         * @todo #261
         * @protected
         */
        this._drag = {
            time: null,
            target: null,
            pointer: null,
            stage: {
                start: null,
                current: null
            },
            direction: null
        };

        /**
         * Current state information and their tags.
         * @type {Object}
         * @protected
         */
        this._states = {
            current: {},
            tags: {
                'initializing': ['busy'],
                'animating': ['busy'],
                'dragging': ['interacting']
            }
        };

        $.each(['onResize', 'onThrottledResize'], $.proxy(function(i, handler) {
            this._handlers[handler] = $.proxy(this[handler], this);
        }, this));

        $.each(Owl.Plugins, $.proxy(function(key, plugin) {
            this._plugins[key.charAt(0).toLowerCase() + key.slice(1)] = new plugin(this);
        }, this));

        $.each(Owl.Workers, $.proxy(function(priority, worker) {
            this._pipe.push({
                'filter': worker.filter,
                'run': $.proxy(worker.run, this)
            });
        }, this));

        this.setup();
        this.initialize();
    }

    /**
     * Default options for the carousel.
     * @public
     */
    Owl.Defaults = {
        items: 3,
        loop: false,
        center: false,
        rewind: false,

        mouseDrag: true,
        touchDrag: true,
        pullDrag: true,
        freeDrag: false,

        margin: 0,
        stagePadding: 0,

        merge: false,
        mergeFit: true,
        autoWidth: false,

        startPosition: 0,
        rtl: false,

        smartSpeed: 250,
        fluidSpeed: false,
        dragEndSpeed: false,

        responsive: {},
        responsiveRefreshRate: 200,
        responsiveBaseElement: window,

        fallbackEasing: 'swing',

        info: false,

        nestedItemSelector: false,
        itemElement: 'div',
        stageElement: 'div',

        refreshClass: 'owl-refresh',
        loadedClass: 'owl-loaded',
        loadingClass: 'owl-loading',
        rtlClass: 'owl-rtl',
        responsiveClass: 'owl-responsive',
        dragClass: 'owl-drag',
        itemClass: 'owl-item',
        stageClass: 'owl-stage',
        stageOuterClass: 'owl-stage-outer',
        grabClass: 'owl-grab'
    };

    /**
     * Enumeration for width.
     * @public
     * @readonly
     * @enum {String}
     */
    Owl.Width = {
        Default: 'default',
        Inner: 'inner',
        Outer: 'outer'
    };

    /**
     * Enumeration for types.
     * @public
     * @readonly
     * @enum {String}
     */
    Owl.Type = {
        Event: 'event',
        State: 'state'
    };

    /**
     * Contains all registered plugins.
     * @public
     */
    Owl.Plugins = {};

    /**
     * List of workers involved in the update process.
     */
    Owl.Workers = [{
        filter: ['width', 'settings'],
        run: function() {
            this._width = this.$element.width();
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            cache.current = this._items && this._items[this.relative(this._current)];
        }
    }, {
        filter: ['items', 'settings'],
        run: function() {
            this.$stage.children('.cloned').remove();
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            var margin = this.settings.margin || '',
                grid = !this.settings.autoWidth,
                rtl = this.settings.rtl,
                css = {
                    'width': 'auto',
                    'margin-left': rtl ? margin : '',
                    'margin-right': rtl ? '' : margin
                };

            !grid && this.$stage.children().css(css);

            cache.css = css;
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            var width = (this.width() / this.settings.items).toFixed(3) - this.settings.margin,
                merge = null,
                iterator = this._items.length,
                grid = !this.settings.autoWidth,
                widths = [];

            cache.items = {
                merge: false,
                width: width
            };

            while (iterator--) {
                merge = this._mergers[iterator];
                merge = this.settings.mergeFit && Math.min(merge, this.settings.items) || merge;

                cache.items.merge = merge > 1 || cache.items.merge;

                widths[iterator] = !grid ? this._items[iterator].width() : width * merge;
            }

            this._widths = widths;
        }
    }, {
        filter: ['items', 'settings'],
        run: function() {
            var clones = [],
                items = this._items,
                settings = this.settings,
                // TODO: Should be computed from number of min width items in stage
                view = Math.max(settings.items * 2, 4),
                size = Math.ceil(items.length / 2) * 2,
                repeat = settings.loop && items.length ? settings.rewind ? view : Math.max(view, size) : 0,
                append = '',
                prepend = '';

            repeat /= 2;

            while (repeat--) {
                // Switch to only using appended clones
                clones.push(this.normalize(clones.length / 2, true));
                append = append + items[clones[clones.length - 1]][0].outerHTML;
                clones.push(this.normalize(items.length - 1 - (clones.length - 1) / 2, true));
                prepend = items[clones[clones.length - 1]][0].outerHTML + prepend;
            }

            this._clones = clones;

            $(append).addClass('cloned').appendTo(this.$stage);
            $(prepend).addClass('cloned').prependTo(this.$stage);
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function() {
            var rtl = this.settings.rtl ? 1 : -1,
                size = this._clones.length + this._items.length,
                iterator = -1,
                previous = 0,
                current = 0,
                coordinates = [];

            while (++iterator < size) {
                previous = coordinates[iterator - 1] || 0;
                current = this._widths[this.relative(iterator)] + this.settings.margin;
                coordinates.push(previous + current * rtl);
            }

            this._coordinates = coordinates;
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function() {
            var padding = this.settings.stagePadding,
                coordinates = this._coordinates,
                css = {
                    'width': Math.ceil(Math.abs(coordinates[coordinates.length - 1])) + padding * 2,
                    'padding-left': padding || '',
                    'padding-right': padding || ''
                };

            this.$stage.css(css);
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            var iterator = this._coordinates.length,
                grid = !this.settings.autoWidth,
                items = this.$stage.children();

            if (grid && cache.items.merge) {
                while (iterator--) {
                    cache.css.width = this._widths[this.relative(iterator)];
                    items.eq(iterator).css(cache.css);
                }
            } else if (grid) {
                cache.css.width = cache.items.width;
                items.css(cache.css);
            }
        }
    }, {
        filter: ['items'],
        run: function() {
            this._coordinates.length < 1 && this.$stage.removeAttr('style');
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function(cache) {
            cache.current = cache.current ? this.$stage.children().index(cache.current) : 0;
            cache.current = Math.max(this.minimum(), Math.min(this.maximum(), cache.current));
            this.reset(cache.current);
        }
    }, {
        filter: ['position'],
        run: function() {
            this.animate(this.coordinates(this._current));
        }
    }, {
        filter: ['width', 'position', 'items', 'settings'],
        run: function() {
            var rtl = this.settings.rtl ? 1 : -1,
                padding = this.settings.stagePadding * 2,
                begin = this.coordinates(this.current()) + padding,
                end = begin + this.width() * rtl,
                inner, outer, matches = [],
                i, n;

            for (i = 0, n = this._coordinates.length; i < n; i++) {
                inner = this._coordinates[i - 1] || 0;
                outer = Math.abs(this._coordinates[i]) + padding * rtl;

                if ((this.op(inner, '<=', begin) && (this.op(inner, '>', end))) ||
                    (this.op(outer, '<', begin) && this.op(outer, '>', end))) {
                    matches.push(i);
                }
            }

            this.$stage.children('.active').removeClass('active');
            this.$stage.children(':eq(' + matches.join('), :eq(') + ')').addClass('active');

            if (this.settings.center) {
                this.$stage.children('.center').removeClass('center');
                this.$stage.children().eq(this.current()).addClass('center');
            }
        }
    }];

    /**
     * Initializes the carousel.
     * @protected
     */
    Owl.prototype.initialize = function() {
        this.enter('initializing');
        this.trigger('initialize');

        this.$element.toggleClass(this.settings.rtlClass, this.settings.rtl);

        if (this.settings.autoWidth && !this.is('pre-loading')) {
            var imgs, nestedSelector, width;
            imgs = this.$element.find('img');
            nestedSelector = this.settings.nestedItemSelector ? '.' + this.settings.nestedItemSelector : undefined;
            width = this.$element.children(nestedSelector).width();

            if (imgs.length && width <= 0) {
                this.preloadAutoWidthImages(imgs);
            }
        }

        this.$element.addClass(this.options.loadingClass);

        // create stage
        this.$stage = $('<' + this.settings.stageElement + ' class="' + this.settings.stageClass + '"/>')
            .wrap('<div class="' + this.settings.stageOuterClass + '"/>');

        // append stage
        this.$element.append(this.$stage.parent());

        // append content
        this.replace(this.$element.children().not(this.$stage.parent()));

        // check visibility
        if (this.$element.is(':visible')) {
            // update view
            this.refresh();
        } else {
            // invalidate width
            this.invalidate('width');
        }

        this.$element
            .removeClass(this.options.loadingClass)
            .addClass(this.options.loadedClass);

        // register event handlers
        this.registerEventHandlers();

        this.leave('initializing');
        this.trigger('initialized');
    };

    /**
     * Setups the current settings.
     * @todo Remove responsive classes. Why should adaptive designs be brought into IE8?
     * @todo Support for media queries by using `matchMedia` would be nice.
     * @public
     */
    Owl.prototype.setup = function() {
        var viewport = this.viewport(),
            overwrites = this.options.responsive,
            match = -1,
            settings = null;

        if (!overwrites) {
            settings = $.extend({}, this.options);
        } else {
            $.each(overwrites, function(breakpoint) {
                if (breakpoint <= viewport && breakpoint > match) {
                    match = Number(breakpoint);
                }
            });

            settings = $.extend({}, this.options, overwrites[match]);
            if (typeof settings.stagePadding === 'function') {
                settings.stagePadding = settings.stagePadding();
            }
            delete settings.responsive;

            // responsive class
            if (settings.responsiveClass) {
                this.$element.attr('class',
                    this.$element.attr('class').replace(new RegExp('(' + this.options.responsiveClass + '-)\\S+\\s', 'g'), '$1' + match)
                );
            }
        }

        this.trigger('change', { property: { name: 'settings', value: settings } });
        this._breakpoint = match;
        this.settings = settings;
        this.invalidate('settings');
        this.trigger('changed', { property: { name: 'settings', value: this.settings } });
    };

    /**
     * Updates option logic if necessery.
     * @protected
     */
    Owl.prototype.optionsLogic = function() {
        if (this.settings.autoWidth) {
            this.settings.stagePadding = false;
            this.settings.merge = false;
        }
    };

    /**
     * Prepares an item before add.
     * @todo Rename event parameter `content` to `item`.
     * @protected
     * @returns {jQuery|HTMLElement} - The item container.
     */
    Owl.prototype.prepare = function(item) {
        var event = this.trigger('prepare', { content: item });

        if (!event.data) {
            event.data = $('<' + this.settings.itemElement + '/>')
                .addClass(this.options.itemClass).append(item)
        }

        this.trigger('prepared', { content: event.data });

        return event.data;
    };

    /**
     * Updates the view.
     * @public
     */
    Owl.prototype.update = function() {
        var i = 0,
            n = this._pipe.length,
            filter = $.proxy(function(p) { return this[p] }, this._invalidated),
            cache = {};

        while (i < n) {
            if (this._invalidated.all || $.grep(this._pipe[i].filter, filter).length > 0) {
                this._pipe[i].run(cache);
            }
            i++;
        }

        this._invalidated = {};

        !this.is('valid') && this.enter('valid');
    };

    /**
     * Gets the width of the view.
     * @public
     * @param {Owl.Width} [dimension=Owl.Width.Default] - The dimension to return.
     * @returns {Number} - The width of the view in pixel.
     */
    Owl.prototype.width = function(dimension) {
        dimension = dimension || Owl.Width.Default;
        switch (dimension) {
            case Owl.Width.Inner:
            case Owl.Width.Outer:
                return this._width;
            default:
                return this._width - this.settings.stagePadding * 2 + this.settings.margin;
        }
    };

    /**
     * Refreshes the carousel primarily for adaptive purposes.
     * @public
     */
    Owl.prototype.refresh = function() {
        this.enter('refreshing');
        this.trigger('refresh');

        this.setup();

        this.optionsLogic();

        this.$element.addClass(this.options.refreshClass);

        this.update();

        this.$element.removeClass(this.options.refreshClass);

        this.leave('refreshing');
        this.trigger('refreshed');
    };

    /**
     * Checks window `resize` event.
     * @protected
     */
    Owl.prototype.onThrottledResize = function() {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(this._handlers.onResize, this.settings.responsiveRefreshRate);
    };

    /**
     * Checks window `resize` event.
     * @protected
     */
    Owl.prototype.onResize = function() {
        if (!this._items.length) {
            return false;
        }

        if (this._width === this.$element.width()) {
            return false;
        }

        if (!this.$element.is(':visible')) {
            return false;
        }

        this.enter('resizing');

        if (this.trigger('resize').isDefaultPrevented()) {
            this.leave('resizing');
            return false;
        }

        this.invalidate('width');

        this.refresh();

        this.leave('resizing');
        this.trigger('resized');
    };

    /**
     * Registers event handlers.
     * @todo Check `msPointerEnabled`
     * @todo #261
     * @protected
     */
    Owl.prototype.registerEventHandlers = function() {
        if ($.support.transition) {
            this.$stage.on($.support.transition.end + '.owl.core', $.proxy(this.onTransitionEnd, this));
        }

        if (this.settings.responsive !== false) {
            this.on(window, 'resize', this._handlers.onThrottledResize);
        }

        if (this.settings.mouseDrag) {
            this.$element.addClass(this.options.dragClass);
            this.$stage.on('mousedown.owl.core', $.proxy(this.onDragStart, this));
            this.$stage.on('dragstart.owl.core selectstart.owl.core', function() { return false });
        }

        if (this.settings.touchDrag) {
            this.$stage.on('touchstart.owl.core', $.proxy(this.onDragStart, this));
            this.$stage.on('touchcancel.owl.core', $.proxy(this.onDragEnd, this));
        }
    };

    /**
     * Handles `touchstart` and `mousedown` events.
     * @todo Horizontal swipe threshold as option
     * @todo #261
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onDragStart = function(event) {
        var stage = null;

        if (event.which === 3) {
            return;
        }

        if ($.support.transform) {
            stage = this.$stage.css('transform').replace(/.*\(|\)| /g, '').split(',');
            stage = {
                x: stage[stage.length === 16 ? 12 : 4],
                y: stage[stage.length === 16 ? 13 : 5]
            };
        } else {
            stage = this.$stage.position();
            stage = {
                x: this.settings.rtl ?
                    stage.left + this.$stage.width() - this.width() + this.settings.margin : stage.left,
                y: stage.top
            };
        }

        if (this.is('animating')) {
            $.support.transform ? this.animate(stage.x) : this.$stage.stop()
            this.invalidate('position');
        }

        this.$element.toggleClass(this.options.grabClass, event.type === 'mousedown');

        this.speed(0);

        this._drag.time = new Date().getTime();
        this._drag.target = $(event.target);
        this._drag.stage.start = stage;
        this._drag.stage.current = stage;
        this._drag.pointer = this.pointer(event);

        $(document).on('mouseup.owl.core touchend.owl.core', $.proxy(this.onDragEnd, this));

        $(document).one('mousemove.owl.core touchmove.owl.core', $.proxy(function(event) {
            var delta = this.difference(this._drag.pointer, this.pointer(event));

            $(document).on('mousemove.owl.core touchmove.owl.core', $.proxy(this.onDragMove, this));

            if (Math.abs(delta.x) < Math.abs(delta.y) && this.is('valid')) {
                return;
            }

            event.preventDefault();

            this.enter('dragging');
            this.trigger('drag');
        }, this));
    };

    /**
     * Handles the `touchmove` and `mousemove` events.
     * @todo #261
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onDragMove = function(event) {
        var minimum = null,
            maximum = null,
            pull = null,
            delta = this.difference(this._drag.pointer, this.pointer(event)),
            stage = this.difference(this._drag.stage.start, delta);

        if (!this.is('dragging')) {
            return;
        }

        event.preventDefault();

        if (this.settings.loop) {
            minimum = this.coordinates(this.minimum());
            maximum = this.coordinates(this.maximum() + 1) - minimum;
            stage.x = (((stage.x - minimum) % maximum + maximum) % maximum) + minimum;
        } else {
            minimum = this.settings.rtl ? this.coordinates(this.maximum()) : this.coordinates(this.minimum());
            maximum = this.settings.rtl ? this.coordinates(this.minimum()) : this.coordinates(this.maximum());
            pull = this.settings.pullDrag ? -1 * delta.x / 5 : 0;
            stage.x = Math.max(Math.min(stage.x, minimum + pull), maximum + pull);
        }

        this._drag.stage.current = stage;

        this.animate(stage.x);
    };

    /**
     * Handles the `touchend` and `mouseup` events.
     * @todo #261
     * @todo Threshold for click event
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onDragEnd = function(event) {
        var delta = this.difference(this._drag.pointer, this.pointer(event)),
            stage = this._drag.stage.current,
            direction = delta.x > 0 ^ this.settings.rtl ? 'left' : 'right';

        $(document).off('.owl.core');

        this.$element.removeClass(this.options.grabClass);

        if (delta.x !== 0 && this.is('dragging') || !this.is('valid')) {
            this.speed(this.settings.dragEndSpeed || this.settings.smartSpeed);
            this.current(this.closest(stage.x, delta.x !== 0 ? direction : this._drag.direction));
            this.invalidate('position');
            this.update();

            this._drag.direction = direction;

            if (Math.abs(delta.x) > 3 || new Date().getTime() - this._drag.time > 300) {
                this._drag.target.one('click.owl.core', function() { return false; });
            }
        }

        if (!this.is('dragging')) {
            return;
        }

        this.leave('dragging');
        this.trigger('dragged');
    };

    /**
     * Gets absolute position of the closest item for a coordinate.
     * @todo Setting `freeDrag` makes `closest` not reusable. See #165.
     * @protected
     * @param {Number} coordinate - The coordinate in pixel.
     * @param {String} direction - The direction to check for the closest item. Ether `left` or `right`.
     * @return {Number} - The absolute position of the closest item.
     */
    Owl.prototype.closest = function(coordinate, direction) {
        var position = -1,
            pull = 30,
            width = this.width(),
            coordinates = this.coordinates();

        if (!this.settings.freeDrag) {
            // check closest item
            $.each(coordinates, $.proxy(function(index, value) {
                // on a left pull, check on current index
                if (direction === 'left' && coordinate > value - pull && coordinate < value + pull) {
                    position = index;
                    // on a right pull, check on previous index
                    // to do so, subtract width from value and set position = index + 1
                } else if (direction === 'right' && coordinate > value - width - pull && coordinate < value - width + pull) {
                    position = index + 1;
                } else if (this.op(coordinate, '<', value) &&
                    this.op(coordinate, '>', coordinates[index + 1] || value - width)) {
                    position = direction === 'left' ? index + 1 : index;
                }
                return position === -1;
            }, this));
        }

        if (!this.settings.loop) {
            // non loop boundries
            if (this.op(coordinate, '>', coordinates[this.minimum()])) {
                position = coordinate = this.minimum();
            } else if (this.op(coordinate, '<', coordinates[this.maximum()])) {
                position = coordinate = this.maximum();
            }
        }

        return position;
    };

    /**
     * Animates the stage.
     * @todo #270
     * @public
     * @param {Number} coordinate - The coordinate in pixels.
     */
    Owl.prototype.animate = function(coordinate) {
        var animate = this.speed() > 0;

        this.is('animating') && this.onTransitionEnd();

        if (animate) {
            this.enter('animating');
            this.trigger('translate');
        }

        if ($.support.transform3d && $.support.transition) {
            this.$stage.css({
                transform: 'translate3d(' + coordinate + 'px,0px,0px)',
                transition: (this.speed() / 1000) + 's'
            });
        } else if (animate) {
            this.$stage.animate({
                left: coordinate + 'px'
            }, this.speed(), this.settings.fallbackEasing, $.proxy(this.onTransitionEnd, this));
        } else {
            this.$stage.css({
                left: coordinate + 'px'
            });
        }
    };

    /**
     * Checks whether the carousel is in a specific state or not.
     * @param {String} state - The state to check.
     * @returns {Boolean} - The flag which indicates if the carousel is busy.
     */
    Owl.prototype.is = function(state) {
        return this._states.current[state] && this._states.current[state] > 0;
    };

    /**
     * Sets the absolute position of the current item.
     * @public
     * @param {Number} [position] - The new absolute position or nothing to leave it unchanged.
     * @returns {Number} - The absolute position of the current item.
     */
    Owl.prototype.current = function(position) {
        if (position === undefined) {
            return this._current;
        }

        if (this._items.length === 0) {
            return undefined;
        }

        position = this.normalize(position);

        if (this._current !== position) {
            var event = this.trigger('change', { property: { name: 'position', value: position } });

            if (event.data !== undefined) {
                position = this.normalize(event.data);
            }

            this._current = position;

            this.invalidate('position');

            this.trigger('changed', { property: { name: 'position', value: this._current } });
        }

        return this._current;
    };

    /**
     * Invalidates the given part of the update routine.
     * @param {String} [part] - The part to invalidate.
     * @returns {Array.<String>} - The invalidated parts.
     */
    Owl.prototype.invalidate = function(part) {
        if ($.type(part) === 'string') {
            this._invalidated[part] = true;
            this.is('valid') && this.leave('valid');
        }
        return $.map(this._invalidated, function(v, i) { return i });
    };

    /**
     * Resets the absolute position of the current item.
     * @public
     * @param {Number} position - The absolute position of the new item.
     */
    Owl.prototype.reset = function(position) {
        position = this.normalize(position);

        if (position === undefined) {
            return;
        }

        this._speed = 0;
        this._current = position;

        this.suppress(['translate', 'translated']);

        this.animate(this.coordinates(position));

        this.release(['translate', 'translated']);
    };

    /**
     * Normalizes an absolute or a relative position of an item.
     * @public
     * @param {Number} position - The absolute or relative position to normalize.
     * @param {Boolean} [relative=false] - Whether the given position is relative or not.
     * @returns {Number} - The normalized position.
     */
    Owl.prototype.normalize = function(position, relative) {
        var n = this._items.length,
            m = relative ? 0 : this._clones.length;

        if (!this.isNumeric(position) || n < 1) {
            position = undefined;
        } else if (position < 0 || position >= n + m) {
            position = ((position - m / 2) % n + n) % n + m / 2;
        }

        return position;
    };

    /**
     * Converts an absolute position of an item into a relative one.
     * @public
     * @param {Number} position - The absolute position to convert.
     * @returns {Number} - The converted position.
     */
    Owl.prototype.relative = function(position) {
        position -= this._clones.length / 2;
        return this.normalize(position, true);
    };

    /**
     * Gets the maximum position for the current item.
     * @public
     * @param {Boolean} [relative=false] - Whether to return an absolute position or a relative position.
     * @returns {Number}
     */
    Owl.prototype.maximum = function(relative) {
        var settings = this.settings,
            maximum = this._coordinates.length,
            iterator,
            reciprocalItemsWidth,
            elementWidth;

        if (settings.loop) {
            maximum = this._clones.length / 2 + this._items.length - 1;
        } else if (settings.autoWidth || settings.merge) {
            iterator = this._items.length;
            reciprocalItemsWidth = this._items[--iterator].width();
            elementWidth = this.$element.width();
            while (iterator--) {
                reciprocalItemsWidth += this._items[iterator].width() + this.settings.margin;
                if (reciprocalItemsWidth > elementWidth) {
                    break;
                }
            }
            maximum = iterator + 1;
        } else if (settings.center) {
            maximum = this._items.length - 1;
        } else {
            maximum = this._items.length - settings.items;
        }

        if (relative) {
            maximum -= this._clones.length / 2;
        }

        return Math.max(maximum, 0);
    };

    /**
     * Gets the minimum position for the current item.
     * @public
     * @param {Boolean} [relative=false] - Whether to return an absolute position or a relative position.
     * @returns {Number}
     */
    Owl.prototype.minimum = function(relative) {
        return relative ? 0 : this._clones.length / 2;
    };

    /**
     * Gets an item at the specified relative position.
     * @public
     * @param {Number} [position] - The relative position of the item.
     * @return {jQuery|Array.<jQuery>} - The item at the given position or all items if no position was given.
     */
    Owl.prototype.items = function(position) {
        if (position === undefined) {
            return this._items.slice();
        }

        position = this.normalize(position, true);
        return this._items[position];
    };

    /**
     * Gets an item at the specified relative position.
     * @public
     * @param {Number} [position] - The relative position of the item.
     * @return {jQuery|Array.<jQuery>} - The item at the given position or all items if no position was given.
     */
    Owl.prototype.mergers = function(position) {
        if (position === undefined) {
            return this._mergers.slice();
        }

        position = this.normalize(position, true);
        return this._mergers[position];
    };

    /**
     * Gets the absolute positions of clones for an item.
     * @public
     * @param {Number} [position] - The relative position of the item.
     * @returns {Array.<Number>} - The absolute positions of clones for the item or all if no position was given.
     */
    Owl.prototype.clones = function(position) {
        var odd = this._clones.length / 2,
            even = odd + this._items.length,
            map = function(index) { return index % 2 === 0 ? even + index / 2 : odd - (index + 1) / 2 };

        if (position === undefined) {
            return $.map(this._clones, function(v, i) { return map(i) });
        }

        return $.map(this._clones, function(v, i) { return v === position ? map(i) : null });
    };

    /**
     * Sets the current animation speed.
     * @public
     * @param {Number} [speed] - The animation speed in milliseconds or nothing to leave it unchanged.
     * @returns {Number} - The current animation speed in milliseconds.
     */
    Owl.prototype.speed = function(speed) {
        if (speed !== undefined) {
            this._speed = speed;
        }

        return this._speed;
    };

    /**
     * Gets the coordinate of an item.
     * @todo The name of this method is missleanding.
     * @public
     * @param {Number} position - The absolute position of the item within `minimum()` and `maximum()`.
     * @returns {Number|Array.<Number>} - The coordinate of the item in pixel or all coordinates.
     */
    Owl.prototype.coordinates = function(position) {
        var multiplier = 1,
            newPosition = position - 1,
            coordinate;

        if (position === undefined) {
            return $.map(this._coordinates, $.proxy(function(coordinate, index) {
                return this.coordinates(index);
            }, this));
        }

        if (this.settings.center) {
            if (this.settings.rtl) {
                multiplier = -1;
                newPosition = position + 1;
            }

            coordinate = this._coordinates[position];
            coordinate += (this.width() - coordinate + (this._coordinates[newPosition] || 0)) / 2 * multiplier;
        } else {
            coordinate = this._coordinates[newPosition] || 0;
        }

        coordinate = Math.ceil(coordinate);

        return coordinate;
    };

    /**
     * Calculates the speed for a translation.
     * @protected
     * @param {Number} from - The absolute position of the start item.
     * @param {Number} to - The absolute position of the target item.
     * @param {Number} [factor=undefined] - The time factor in milliseconds.
     * @returns {Number} - The time in milliseconds for the translation.
     */
    Owl.prototype.duration = function(from, to, factor) {
        if (factor === 0) {
            return 0;
        }

        return Math.min(Math.max(Math.abs(to - from), 1), 6) * Math.abs((factor || this.settings.smartSpeed));
    };

    /**
     * Slides to the specified item.
     * @public
     * @param {Number} position - The position of the item.
     * @param {Number} [speed] - The time in milliseconds for the transition.
     */
    Owl.prototype.to = function(position, speed) {
        var current = this.current(),
            revert = null,
            distance = position - this.relative(current),
            direction = (distance > 0) - (distance < 0),
            items = this._items.length,
            minimum = this.minimum(),
            maximum = this.maximum();

        if (this.settings.loop) {
            if (!this.settings.rewind && Math.abs(distance) > items / 2) {
                distance += direction * -1 * items;
            }

            position = current + distance;
            revert = ((position - minimum) % items + items) % items + minimum;

            if (revert !== position && revert - distance <= maximum && revert - distance > 0) {
                current = revert - distance;
                position = revert;
                this.reset(current);
            }
        } else if (this.settings.rewind) {
            maximum += 1;
            position = (position % maximum + maximum) % maximum;
        } else {
            position = Math.max(minimum, Math.min(maximum, position));
        }

        this.speed(this.duration(current, position, speed));
        this.current(position);

        if (this.$element.is(':visible')) {
            this.update();
        }
    };

    /**
     * Slides to the next item.
     * @public
     * @param {Number} [speed] - The time in milliseconds for the transition.
     */
    Owl.prototype.next = function(speed) {
        speed = speed || false;
        this.to(this.relative(this.current()) + 1, speed);
    };

    /**
     * Slides to the previous item.
     * @public
     * @param {Number} [speed] - The time in milliseconds for the transition.
     */
    Owl.prototype.prev = function(speed) {
        speed = speed || false;
        this.to(this.relative(this.current()) - 1, speed);
    };

    /**
     * Handles the end of an animation.
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onTransitionEnd = function(event) {

        // if css2 animation then event object is undefined
        if (event !== undefined) {
            event.stopPropagation();

            // Catch only owl-stage transitionEnd event
            if ((event.target || event.srcElement || event.originalTarget) !== this.$stage.get(0)) {
                return false;
            }
        }

        this.leave('animating');
        this.trigger('translated');
    };

    /**
     * Gets viewport width.
     * @protected
     * @return {Number} - The width in pixel.
     */
    Owl.prototype.viewport = function() {
        var width;
        if (this.options.responsiveBaseElement !== window) {
            width = $(this.options.responsiveBaseElement).width();
        } else if (window.innerWidth) {
            width = window.innerWidth;
        } else if (document.documentElement && document.documentElement.clientWidth) {
            width = document.documentElement.clientWidth;
        } else {
            console.warn('Can not detect viewport width.');
        }
        return width;
    };

    /**
     * Replaces the current content.
     * @public
     * @param {HTMLElement|jQuery|String} content - The new content.
     */
    Owl.prototype.replace = function(content) {
        this.$stage.empty();
        this._items = [];

        if (content) {
            content = (content instanceof jQuery) ? content : $(content);
        }

        if (this.settings.nestedItemSelector) {
            content = content.find('.' + this.settings.nestedItemSelector);
        }

        content.filter(function() {
            return this.nodeType === 1;
        }).each($.proxy(function(index, item) {
            item = this.prepare(item);
            this.$stage.append(item);
            this._items.push(item);
            this._mergers.push(item.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        }, this));

        this.reset(this.isNumeric(this.settings.startPosition) ? this.settings.startPosition : 0);

        this.invalidate('items');
    };

    /**
     * Adds an item.
     * @todo Use `item` instead of `content` for the event arguments.
     * @public
     * @param {HTMLElement|jQuery|String} content - The item content to add.
     * @param {Number} [position] - The relative position at which to insert the item otherwise the item will be added to the end.
     */
    Owl.prototype.add = function(content, position) {
        var current = this.relative(this._current);

        position = position === undefined ? this._items.length : this.normalize(position, true);
        content = content instanceof jQuery ? content : $(content);

        this.trigger('add', { content: content, position: position });

        content = this.prepare(content);

        if (this._items.length === 0 || position === this._items.length) {
            this._items.length === 0 && this.$stage.append(content);
            this._items.length !== 0 && this._items[position - 1].after(content);
            this._items.push(content);
            this._mergers.push(content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        } else {
            this._items[position].before(content);
            this._items.splice(position, 0, content);
            this._mergers.splice(position, 0, content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        }

        this._items[current] && this.reset(this._items[current].index());

        this.invalidate('items');

        this.trigger('added', { content: content, position: position });
    };

    /**
     * Removes an item by its position.
     * @todo Use `item` instead of `content` for the event arguments.
     * @public
     * @param {Number} position - The relative position of the item to remove.
     */
    Owl.prototype.remove = function(position) {
        position = this.normalize(position, true);

        if (position === undefined) {
            return;
        }

        this.trigger('remove', { content: this._items[position], position: position });

        this._items[position].remove();
        this._items.splice(position, 1);
        this._mergers.splice(position, 1);

        this.invalidate('items');

        this.trigger('removed', { content: null, position: position });
    };

    /**
     * Preloads images with auto width.
     * @todo Replace by a more generic approach
     * @protected
     */
    Owl.prototype.preloadAutoWidthImages = function(images) {
        images.each($.proxy(function(i, element) {
            this.enter('pre-loading');
            element = $(element);
            $(new Image()).one('load', $.proxy(function(e) {
                element.attr('src', e.target.src);
                element.css('opacity', 1);
                this.leave('pre-loading');
                !this.is('pre-loading') && !this.is('initializing') && this.refresh();
            }, this)).attr('src', element.attr('src') || element.attr('data-src') || element.attr('data-src-retina'));
        }, this));
    };

    /**
     * Destroys the carousel.
     * @public
     */
    Owl.prototype.destroy = function() {

        this.$element.off('.owl.core');
        this.$stage.off('.owl.core');
        $(document).off('.owl.core');

        if (this.settings.responsive !== false) {
            window.clearTimeout(this.resizeTimer);
            this.off(window, 'resize', this._handlers.onThrottledResize);
        }

        for (var i in this._plugins) {
            this._plugins[i].destroy();
        }

        this.$stage.children('.cloned').remove();

        this.$stage.unwrap();
        this.$stage.children().contents().unwrap();
        this.$stage.children().unwrap();

        this.$element
            .removeClass(this.options.refreshClass)
            .removeClass(this.options.loadingClass)
            .removeClass(this.options.loadedClass)
            .removeClass(this.options.rtlClass)
            .removeClass(this.options.dragClass)
            .removeClass(this.options.grabClass)
            .attr('class', this.$element.attr('class').replace(new RegExp(this.options.responsiveClass + '-\\S+\\s', 'g'), ''))
            .removeData('owl.carousel');
    };

    /**
     * Operators to calculate right-to-left and left-to-right.
     * @protected
     * @param {Number} [a] - The left side operand.
     * @param {String} [o] - The operator.
     * @param {Number} [b] - The right side operand.
     */
    Owl.prototype.op = function(a, o, b) {
        var rtl = this.settings.rtl;
        switch (o) {
            case '<':
                return rtl ? a > b : a < b;
            case '>':
                return rtl ? a < b : a > b;
            case '>=':
                return rtl ? a <= b : a >= b;
            case '<=':
                return rtl ? a >= b : a <= b;
            default:
                break;
        }
    };

    /**
     * Attaches to an internal event.
     * @protected
     * @param {HTMLElement} element - The event source.
     * @param {String} event - The event name.
     * @param {Function} listener - The event handler to attach.
     * @param {Boolean} capture - Wether the event should be handled at the capturing phase or not.
     */
    Owl.prototype.on = function(element, event, listener, capture) {
        if (element.addEventListener) {
            element.addEventListener(event, listener, capture);
        } else if (element.attachEvent) {
            element.attachEvent('on' + event, listener);
        }
    };

    /**
     * Detaches from an internal event.
     * @protected
     * @param {HTMLElement} element - The event source.
     * @param {String} event - The event name.
     * @param {Function} listener - The attached event handler to detach.
     * @param {Boolean} capture - Wether the attached event handler was registered as a capturing listener or not.
     */
    Owl.prototype.off = function(element, event, listener, capture) {
        if (element.removeEventListener) {
            element.removeEventListener(event, listener, capture);
        } else if (element.detachEvent) {
            element.detachEvent('on' + event, listener);
        }
    };

    /**
     * Triggers a public event.
     * @todo Remove `status`, `relatedTarget` should be used instead.
     * @protected
     * @param {String} name - The event name.
     * @param {*} [data=null] - The event data.
     * @param {String} [namespace=carousel] - The event namespace.
     * @param {String} [state] - The state which is associated with the event.
     * @param {Boolean} [enter=false] - Indicates if the call enters the specified state or not.
     * @returns {Event} - The event arguments.
     */
    Owl.prototype.trigger = function(name, data, namespace, state, enter) {
        var status = {
                item: { count: this._items.length, index: this.current() }
            },
            handler = $.camelCase(
                $.grep(['on', name, namespace], function(v) { return v })
                .join('-').toLowerCase()
            ),
            event = $.Event(
                [name, 'owl', namespace || 'carousel'].join('.').toLowerCase(),
                $.extend({ relatedTarget: this }, status, data)
            );

        if (!this._supress[name]) {
            $.each(this._plugins, function(name, plugin) {
                if (plugin.onTrigger) {
                    plugin.onTrigger(event);
                }
            });

            this.register({ type: Owl.Type.Event, name: name });
            this.$element.trigger(event);

            if (this.settings && typeof this.settings[handler] === 'function') {
                this.settings[handler].call(this, event);
            }
        }

        return event;
    };

    /**
     * Enters a state.
     * @param name - The state name.
     */
    Owl.prototype.enter = function(name) {
        $.each([name].concat(this._states.tags[name] || []), $.proxy(function(i, name) {
            if (this._states.current[name] === undefined) {
                this._states.current[name] = 0;
            }

            this._states.current[name]++;
        }, this));
    };

    /**
     * Leaves a state.
     * @param name - The state name.
     */
    Owl.prototype.leave = function(name) {
        $.each([name].concat(this._states.tags[name] || []), $.proxy(function(i, name) {
            this._states.current[name]--;
        }, this));
    };

    /**
     * Registers an event or state.
     * @public
     * @param {Object} object - The event or state to register.
     */
    Owl.prototype.register = function(object) {
        if (object.type === Owl.Type.Event) {
            if (!$.event.special[object.name]) {
                $.event.special[object.name] = {};
            }

            if (!$.event.special[object.name].owl) {
                var _default = $.event.special[object.name]._default;
                $.event.special[object.name]._default = function(e) {
                    if (_default && _default.apply && (!e.namespace || e.namespace.indexOf('owl') === -1)) {
                        return _default.apply(this, arguments);
                    }
                    return e.namespace && e.namespace.indexOf('owl') > -1;
                };
                $.event.special[object.name].owl = true;
            }
        } else if (object.type === Owl.Type.State) {
            if (!this._states.tags[object.name]) {
                this._states.tags[object.name] = object.tags;
            } else {
                this._states.tags[object.name] = this._states.tags[object.name].concat(object.tags);
            }

            this._states.tags[object.name] = $.grep(this._states.tags[object.name], $.proxy(function(tag, i) {
                return $.inArray(tag, this._states.tags[object.name]) === i;
            }, this));
        }
    };

    /**
     * Suppresses events.
     * @protected
     * @param {Array.<String>} events - The events to suppress.
     */
    Owl.prototype.suppress = function(events) {
        $.each(events, $.proxy(function(index, event) {
            this._supress[event] = true;
        }, this));
    };

    /**
     * Releases suppressed events.
     * @protected
     * @param {Array.<String>} events - The events to release.
     */
    Owl.prototype.release = function(events) {
        $.each(events, $.proxy(function(index, event) {
            delete this._supress[event];
        }, this));
    };

    /**
     * Gets unified pointer coordinates from event.
     * @todo #261
     * @protected
     * @param {Event} - The `mousedown` or `touchstart` event.
     * @returns {Object} - Contains `x` and `y` coordinates of current pointer position.
     */
    Owl.prototype.pointer = function(event) {
        var result = { x: null, y: null };

        event = event.originalEvent || event || window.event;

        event = event.touches && event.touches.length ?
            event.touches[0] : event.changedTouches && event.changedTouches.length ?
            event.changedTouches[0] : event;

        if (event.pageX) {
            result.x = event.pageX;
            result.y = event.pageY;
        } else {
            result.x = event.clientX;
            result.y = event.clientY;
        }

        return result;
    };

    /**
     * Determines if the input is a Number or something that can be coerced to a Number
     * @protected
     * @param {Number|String|Object|Array|Boolean|RegExp|Function|Symbol} - The input to be tested
     * @returns {Boolean} - An indication if the input is a Number or can be coerced to a Number
     */
    Owl.prototype.isNumeric = function(number) {
        return !isNaN(parseFloat(number));
    };

    /**
     * Gets the difference of two vectors.
     * @todo #261
     * @protected
     * @param {Object} - The first vector.
     * @param {Object} - The second vector.
     * @returns {Object} - The difference.
     */
    Owl.prototype.difference = function(first, second) {
        return {
            x: first.x - second.x,
            y: first.y - second.y
        };
    };

    /**
     * The jQuery Plugin for the Owl Carousel
     * @todo Navigation plugin `next` and `prev`
     * @public
     */
    $.fn.owlCarousel = function(option) {
        var args = Array.prototype.slice.call(arguments, 1);

        return this.each(function() {
            var $this = $(this),
                data = $this.data('owl.carousel');

            if (!data) {
                data = new Owl(this, typeof option == 'object' && option);
                $this.data('owl.carousel', data);

                $.each([
                    'next', 'prev', 'to', 'destroy', 'refresh', 'replace', 'add', 'remove'
                ], function(i, event) {
                    data.register({ type: Owl.Type.Event, name: event });
                    data.$element.on(event + '.owl.carousel.core', $.proxy(function(e) {
                        if (e.namespace && e.relatedTarget !== this) {
                            this.suppress([event]);
                            data[event].apply(this, [].slice.call(arguments, 1));
                            this.release([event]);
                        }
                    }, data));
                });
            }

            if (typeof option == 'string' && option.charAt(0) !== '_') {
                data[option].apply(data, args);
            }
        });
    };

    /**
     * The constructor for the jQuery Plugin
     * @public
     */
    $.fn.owlCarousel.Constructor = Owl;

})(window.Zepto || window.jQuery, window, document);

/**
 * AutoRefresh Plugin
 * @version 2.1.0
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Creates the auto refresh plugin.
     * @class The Auto Refresh Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var AutoRefresh = function(carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Refresh interval.
         * @protected
         * @type {number}
         */
        this._interval = null;

        /**
         * Whether the element is currently visible or not.
         * @protected
         * @type {Boolean}
         */
        this._visible = null;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoRefresh) {
                    this.watch();
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, AutoRefresh.Defaults, this._core.options);

        // register event handlers
        this._core.$element.on(this._handlers);
    };

    /**
     * Default options.
     * @public
     */
    AutoRefresh.Defaults = {
        autoRefresh: true,
        autoRefreshInterval: 500
    };

    /**
     * Watches the element.
     */
    AutoRefresh.prototype.watch = function() {
        if (this._interval) {
            return;
        }

        this._visible = this._core.$element.is(':visible');
        this._interval = window.setInterval($.proxy(this.refresh, this), this._core.settings.autoRefreshInterval);
    };

    /**
     * Refreshes the element.
     */
    AutoRefresh.prototype.refresh = function() {
        if (this._core.$element.is(':visible') === this._visible) {
            return;
        }

        this._visible = !this._visible;

        this._core.$element.toggleClass('owl-hidden', !this._visible);

        this._visible && (this._core.invalidate('width') && this._core.refresh());
    };

    /**
     * Destroys the plugin.
     */
    AutoRefresh.prototype.destroy = function() {
        var handler, property;

        window.clearInterval(this._interval);

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.AutoRefresh = AutoRefresh;

})(window.Zepto || window.jQuery, window, document);

/**
 * Lazy Plugin
 * @version 2.1.0
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Creates the lazy plugin.
     * @class The Lazy Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var Lazy = function(carousel) {

        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Already loaded items.
         * @protected
         * @type {Array.<jQuery>}
         */
        this._loaded = [];

        /**
         * Event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel change.owl.carousel resized.owl.carousel': $.proxy(function(e) {
                if (!e.namespace) {
                    return;
                }

                if (!this._core.settings || !this._core.settings.lazyLoad) {
                    return;
                }

                if ((e.property && e.property.name == 'position') || e.type == 'initialized') {
                    var settings = this._core.settings,
                        n = (settings.center && Math.ceil(settings.items / 2) || settings.items),
                        i = ((settings.center && n * -1) || 0),
                        position = (e.property && e.property.value !== undefined ? e.property.value : this._core.current()) + i,
                        clones = this._core.clones().length,
                        load = $.proxy(function(i, v) { this.load(v) }, this);

                    while (i++ < n) {
                        this.load(clones / 2 + this._core.relative(position));
                        clones && $.each(this._core.clones(this._core.relative(position)), load);
                        position++;
                    }
                }
            }, this)
        };

        // set the default options
        this._core.options = $.extend({}, Lazy.Defaults, this._core.options);

        // register event handler
        this._core.$element.on(this._handlers);
    };

    /**
     * Default options.
     * @public
     */
    Lazy.Defaults = {
        lazyLoad: false
    };

    /**
     * Loads all resources of an item at the specified position.
     * @param {Number} position - The absolute position of the item.
     * @protected
     */
    Lazy.prototype.load = function(position) {
        var $item = this._core.$stage.children().eq(position),
            $elements = $item && $item.find('.owl-lazy');

        if (!$elements || $.inArray($item.get(0), this._loaded) > -1) {
            return;
        }

        $elements.each($.proxy(function(index, element) {
            var $element = $(element),
                image,
                url = (window.devicePixelRatio > 1 && $element.attr('data-src-retina')) || $element.attr('data-src');

            this._core.trigger('load', { element: $element, url: url }, 'lazy');

            if ($element.is('img')) {
                $element.one('load.owl.lazy', $.proxy(function() {
                    $element.css('opacity', 1);
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this)).attr('src', url);
            } else {
                image = new Image();
                image.onload = $.proxy(function() {
                    $element.css({
                        'background-image': 'url("' + url + '")',
                        'opacity': '1'
                    });
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this);
                image.src = url;
            }
        }, this));

        this._loaded.push($item.get(0));
    };

    /**
     * Destroys the plugin.
     * @public
     */
    Lazy.prototype.destroy = function() {
        var handler, property;

        for (handler in this.handlers) {
            this._core.$element.off(handler, this.handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Lazy = Lazy;

})(window.Zepto || window.jQuery, window, document);

/**
 * AutoHeight Plugin
 * @version 2.1.0
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Creates the auto height plugin.
     * @class The Auto Height Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var AutoHeight = function(carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel refreshed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoHeight) {
                    this.update();
                }
            }, this),
            'changed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoHeight && e.property.name == 'position') {
                    this.update();
                }
            }, this),
            'loaded.owl.lazy': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoHeight &&
                    e.element.closest('.' + this._core.settings.itemClass).index() === this._core.current()) {
                    this.update();
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, AutoHeight.Defaults, this._core.options);

        // register event handlers
        this._core.$element.on(this._handlers);
    };

    /**
     * Default options.
     * @public
     */
    AutoHeight.Defaults = {
        autoHeight: false,
        autoHeightClass: 'owl-height'
    };

    /**
     * Updates the view.
     */
    AutoHeight.prototype.update = function() {
        var start = this._core._current,
            end = start + this._core.settings.items,
            visible = this._core.$stage.children().toArray().slice(start, end),
            heights = [],
            maxheight = 0;

        $.each(visible, function(index, item) {
            heights.push($(item).height());
        });

        maxheight = Math.max.apply(null, heights);

        this._core.$stage.parent()
            .height(maxheight)
            .addClass(this._core.settings.autoHeightClass);
    };

    AutoHeight.prototype.destroy = function() {
        var handler, property;

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.AutoHeight = AutoHeight;

})(window.Zepto || window.jQuery, window, document);

/**
 * Video Plugin
 * @version 2.1.0
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Creates the video plugin.
     * @class The Video Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var Video = function(carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Cache all video URLs.
         * @protected
         * @type {Object}
         */
        this._videos = {};

        /**
         * Current playing item.
         * @protected
         * @type {jQuery}
         */
        this._playing = null;

        /**
         * All event handlers.
         * @todo The cloned content removale is too late
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel': $.proxy(function(e) {
                if (e.namespace) {
                    this._core.register({ type: 'state', name: 'playing', tags: ['interacting'] });
                }
            }, this),
            'resize.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.video && this.isInFullScreen()) {
                    e.preventDefault();
                }
            }, this),
            'refreshed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.is('resizing')) {
                    this._core.$stage.find('.cloned .owl-video-frame').remove();
                }
            }, this),
            'changed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name === 'position' && this._playing) {
                    this.stop();
                }
            }, this),
            'prepared.owl.carousel': $.proxy(function(e) {
                if (!e.namespace) {
                    return;
                }

                var $element = $(e.content).find('.owl-video');

                if ($element.length) {
                    $element.css('display', 'none');
                    this.fetch($element, $(e.content));
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, Video.Defaults, this._core.options);

        // register event handlers
        this._core.$element.on(this._handlers);

        this._core.$element.on('click.owl.video', '.owl-video-play-icon', $.proxy(function(e) {
            this.play(e);
        }, this));
    };

    /**
     * Default options.
     * @public
     */
    Video.Defaults = {
        video: false,
        videoHeight: false,
        videoWidth: false
    };

    /**
     * Gets the video ID and the type (YouTube/Vimeo/vzaar only).
     * @protected
     * @param {jQuery} target - The target containing the video data.
     * @param {jQuery} item - The item containing the video.
     */
    Video.prototype.fetch = function(target, item) {
        var type = (function() {
                if (target.attr('data-vimeo-id')) {
                    return 'vimeo';
                } else if (target.attr('data-vzaar-id')) {
                    return 'vzaar'
                } else {
                    return 'youtube';
                }
            })(),
            id = target.attr('data-vimeo-id') || target.attr('data-youtube-id') || target.attr('data-vzaar-id'),
            width = target.attr('data-width') || this._core.settings.videoWidth,
            height = target.attr('data-height') || this._core.settings.videoHeight,
            url = target.attr('href');

        if (url) {

            /*
            		Parses the id's out of the following urls (and probably more):
            		https://www.youtube.com/watch?v=:id
            		https://youtu.be/:id
            		https://vimeo.com/:id
            		https://vimeo.com/channels/:channel/:id
            		https://vimeo.com/groups/:group/videos/:id
            		https://app.vzaar.com/videos/:id

            		Visual example: https://regexper.com/#(http%3A%7Chttps%3A%7C)%5C%2F%5C%2F(player.%7Cwww.%7Capp.)%3F(vimeo%5C.com%7Cyoutu(be%5C.com%7C%5C.be%7Cbe%5C.googleapis%5C.com)%7Cvzaar%5C.com)%5C%2F(video%5C%2F%7Cvideos%5C%2F%7Cembed%5C%2F%7Cchannels%5C%2F.%2B%5C%2F%7Cgroups%5C%2F.%2B%5C%2F%7Cwatch%5C%3Fv%3D%7Cv%5C%2F)%3F(%5BA-Za-z0-9._%25-%5D*)(%5C%26%5CS%2B)%3F
            */

            id = url.match(/(http:|https:|)\/\/(player.|www.|app.)?(vimeo\.com|youtu(be\.com|\.be|be\.googleapis\.com)|vzaar\.com)\/(video\/|videos\/|embed\/|channels\/.+\/|groups\/.+\/|watch\?v=|v\/)?([A-Za-z0-9._%-]*)(\&\S+)?/);

            if (id[3].indexOf('youtu') > -1) {
                type = 'youtube';
            } else if (id[3].indexOf('vimeo') > -1) {
                type = 'vimeo';
            } else if (id[3].indexOf('vzaar') > -1) {
                type = 'vzaar';
            } else {
                throw new Error('Video URL not supported.');
            }
            id = id[6];
        } else {
            throw new Error('Missing video URL.');
        }

        this._videos[url] = {
            type: type,
            id: id,
            width: width,
            height: height
        };

        item.attr('data-video', url);

        this.thumbnail(target, this._videos[url]);
    };

    /**
     * Creates video thumbnail.
     * @protected
     * @param {jQuery} target - The target containing the video data.
     * @param {Object} info - The video info object.
     * @see `fetch`
     */
    Video.prototype.thumbnail = function(target, video) {
        var tnLink,
            icon,
            path,
            dimensions = video.width && video.height ? 'style="width:' + video.width + 'px;height:' + video.height + 'px;"' : '',
            customTn = target.find('img'),
            srcType = 'src',
            lazyClass = '',
            settings = this._core.settings,
            create = function(path) {
                icon = '<div class="owl-video-play-icon"></div>';

                if (settings.lazyLoad) {
                    tnLink = '<div class="owl-video-tn ' + lazyClass + '" ' + srcType + '="' + path + '"></div>';
                } else {
                    tnLink = '<div class="owl-video-tn" style="opacity:1;background-image:url(' + path + ')"></div>';
                }
                target.after(tnLink);
                target.after(icon);
            };

        // wrap video content into owl-video-wrapper div
        target.wrap('<div class="owl-video-wrapper"' + dimensions + '></div>');

        if (this._core.settings.lazyLoad) {
            srcType = 'data-src';
            lazyClass = 'owl-lazy';
        }

        // custom thumbnail
        if (customTn.length) {
            create(customTn.attr(srcType));
            customTn.remove();
            return false;
        }

        if (video.type === 'youtube') {
            path = "//img.youtube.com/vi/" + video.id + "/hqdefault.jpg";
            create(path);
        } else if (video.type === 'vimeo') {
            $.ajax({
                type: 'GET',
                url: '//vimeo.com/api/v2/video/' + video.id + '.json',
                jsonp: 'callback',
                dataType: 'jsonp',
                success: function(data) {
                    path = data[0].thumbnail_large;
                    create(path);
                }
            });
        } else if (video.type === 'vzaar') {
            $.ajax({
                type: 'GET',
                url: '//vzaar.com/api/videos/' + video.id + '.json',
                jsonp: 'callback',
                dataType: 'jsonp',
                success: function(data) {
                    path = data.framegrab_url;
                    create(path);
                }
            });
        }
    };

    /**
     * Stops the current video.
     * @public
     */
    Video.prototype.stop = function() {
        this._core.trigger('stop', null, 'video');
        this._playing.find('.owl-video-frame').remove();
        this._playing.removeClass('owl-video-playing');
        this._playing = null;
        this._core.leave('playing');
        this._core.trigger('stopped', null, 'video');
    };

    /**
     * Starts the current video.
     * @public
     * @param {Event} event - The event arguments.
     */
    Video.prototype.play = function(event) {
        var target = $(event.target),
            item = target.closest('.' + this._core.settings.itemClass),
            video = this._videos[item.attr('data-video')],
            width = video.width || '100%',
            height = video.height || this._core.$stage.height(),
            html;

        if (this._playing) {
            return;
        }

        this._core.enter('playing');
        this._core.trigger('play', null, 'video');

        item = this._core.items(this._core.relative(item.index()));

        this._core.reset(item.index());

        if (video.type === 'youtube') {
            html = '<iframe width="' + width + '" height="' + height + '" src="//www.youtube.com/embed/' +
                video.id + '?autoplay=1&rel=0&v=' + video.id + '" frameborder="0" allowfullscreen></iframe>';
        } else if (video.type === 'vimeo') {
            html = '<iframe src="//player.vimeo.com/video/' + video.id +
                '?autoplay=1" width="' + width + '" height="' + height +
                '" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>';
        } else if (video.type === 'vzaar') {
            html = '<iframe frameborder="0"' + 'height="' + height + '"' + 'width="' + width +
                '" allowfullscreen mozallowfullscreen webkitAllowFullScreen ' +
                'src="//view.vzaar.com/' + video.id + '/player?autoplay=true"></iframe>';
        }

        $('<div class="owl-video-frame">' + html + '</div>').insertAfter(item.find('.owl-video'));

        this._playing = item.addClass('owl-video-playing');
    };

    /**
     * Checks whether an video is currently in full screen mode or not.
     * @todo Bad style because looks like a readonly method but changes members.
     * @protected
     * @returns {Boolean}
     */
    Video.prototype.isInFullScreen = function() {
        var element = document.fullscreenElement || document.mozFullScreenElement ||
            document.webkitFullscreenElement;

        return element && $(element).parent().hasClass('owl-video-frame');
    };

    /**
     * Destroys the plugin.
     */
    Video.prototype.destroy = function() {
        var handler, property;

        this._core.$element.off('click.owl.video');

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Video = Video;

})(window.Zepto || window.jQuery, window, document);

/**
 * Animate Plugin
 * @version 2.1.0
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Creates the animate plugin.
     * @class The Navigation Plugin
     * @param {Owl} scope - The Owl Carousel
     */
    var Animate = function(scope) {
        this.core = scope;
        this.core.options = $.extend({}, Animate.Defaults, this.core.options);
        this.swapping = true;
        this.previous = undefined;
        this.next = undefined;

        this.handlers = {
            'change.owl.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name == 'position') {
                    this.previous = this.core.current();
                    this.next = e.property.value;
                }
            }, this),
            'drag.owl.carousel dragged.owl.carousel translated.owl.carousel': $.proxy(function(e) {
                if (e.namespace) {
                    this.swapping = e.type == 'translated';
                }
            }, this),
            'translate.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this.swapping && (this.core.options.animateOut || this.core.options.animateIn)) {
                    this.swap();
                }
            }, this)
        };

        this.core.$element.on(this.handlers);
    };

    /**
     * Default options.
     * @public
     */
    Animate.Defaults = {
        animateOut: false,
        animateIn: false
    };

    /**
     * Toggles the animation classes whenever an translations starts.
     * @protected
     * @returns {Boolean|undefined}
     */
    Animate.prototype.swap = function() {

        if (this.core.settings.items !== 1) {
            return;
        }

        if (!$.support.animation || !$.support.transition) {
            return;
        }

        this.core.speed(0);

        var left,
            clear = $.proxy(this.clear, this),
            previous = this.core.$stage.children().eq(this.previous),
            next = this.core.$stage.children().eq(this.next),
            incoming = this.core.settings.animateIn,
            outgoing = this.core.settings.animateOut;

        if (this.core.current() === this.previous) {
            return;
        }

        if (outgoing) {
            left = this.core.coordinates(this.previous) - this.core.coordinates(this.next);
            previous.one($.support.animation.end, clear)
                .css({ 'left': left + 'px' })
                .addClass('animated owl-animated-out')
                .addClass(outgoing);
        }

        if (incoming) {
            next.one($.support.animation.end, clear)
                .addClass('animated owl-animated-in')
                .addClass(incoming);
        }
    };

    Animate.prototype.clear = function(e) {
        $(e.target).css({ 'left': '' })
            .removeClass('animated owl-animated-out owl-animated-in')
            .removeClass(this.core.settings.animateIn)
            .removeClass(this.core.settings.animateOut);
        this.core.onTransitionEnd();
    };

    /**
     * Destroys the plugin.
     * @public
     */
    Animate.prototype.destroy = function() {
        var handler, property;

        for (handler in this.handlers) {
            this.core.$element.off(handler, this.handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Animate = Animate;

})(window.Zepto || window.jQuery, window, document);

/**
 * Autoplay Plugin
 * @version 2.1.0
 * @author Bartosz Wojciechowski
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    /**
     * Creates the autoplay plugin.
     * @class The Autoplay Plugin
     * @param {Owl} scope - The Owl Carousel
     */
    var Autoplay = function(carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * The autoplay timeout.
         * @type {Timeout}
         */
        this._timeout = null;

        /**
         * Indicates whenever the autoplay is paused.
         * @type {Boolean}
         */
        this._paused = false;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'changed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name === 'settings') {
                    if (this._core.settings.autoplay) {
                        this.play();
                    } else {
                        this.stop();
                    }
                } else if (e.namespace && e.property.name === 'position') {
                    //console.log('play?', e);
                    if (this._core.settings.autoplay) {
                        this._setAutoPlayInterval();
                    }
                }
            }, this),
            'initialized.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.autoplay) {
                    this.play();
                }
            }, this),
            'play.owl.autoplay': $.proxy(function(e, t, s) {
                if (e.namespace) {
                    this.play(t, s);
                }
            }, this),
            'stop.owl.autoplay': $.proxy(function(e) {
                if (e.namespace) {
                    this.stop();
                }
            }, this),
            'mouseover.owl.autoplay': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.pause();
                }
            }, this),
            'mouseleave.owl.autoplay': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.play();
                }
            }, this),
            'touchstart.owl.core': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.pause();
                }
            }, this),
            'touchend.owl.core': $.proxy(function() {
                if (this._core.settings.autoplayHoverPause) {
                    this.play();
                }
            }, this)
        };

        // register event handlers
        this._core.$element.on(this._handlers);

        // set default options
        this._core.options = $.extend({}, Autoplay.Defaults, this._core.options);
    };

    /**
     * Default options.
     * @public
     */
    Autoplay.Defaults = {
        autoplay: false,
        autoplayTimeout: 5000,
        autoplayHoverPause: false,
        autoplaySpeed: false
    };

    /**
     * Starts the autoplay.
     * @public
     * @param {Number} [timeout] - The interval before the next animation starts.
     * @param {Number} [speed] - The animation speed for the animations.
     */
    Autoplay.prototype.play = function(timeout, speed) {
        this._paused = false;

        if (this._core.is('rotating')) {
            return;
        }

        this._core.enter('rotating');

        this._setAutoPlayInterval();
    };

    /**
     * Gets a new timeout
     * @private
     * @param {Number} [timeout] - The interval before the next animation starts.
     * @param {Number} [speed] - The animation speed for the animations.
     * @return {Timeout}
     */
    Autoplay.prototype._getNextTimeout = function(timeout, speed) {
        if (this._timeout) {
            window.clearTimeout(this._timeout);
        }
        return window.setTimeout($.proxy(function() {
            if (this._paused || this._core.is('busy') || this._core.is('interacting') || document.hidden) {
                return;
            }
            this._core.next(speed || this._core.settings.autoplaySpeed);
        }, this), timeout || this._core.settings.autoplayTimeout);
    };

    /**
     * Sets autoplay in motion.
     * @private
     */
    Autoplay.prototype._setAutoPlayInterval = function() {
        this._timeout = this._getNextTimeout();
    };

    /**
     * Stops the autoplay.
     * @public
     */
    Autoplay.prototype.stop = function() {
        if (!this._core.is('rotating')) {
            return;
        }

        window.clearTimeout(this._timeout);
        this._core.leave('rotating');
    };

    /**
     * Stops the autoplay.
     * @public
     */
    Autoplay.prototype.pause = function() {
        if (!this._core.is('rotating')) {
            return;
        }

        this._paused = true;
    };

    /**
     * Destroys the plugin.
     */
    Autoplay.prototype.destroy = function() {
        var handler, property;

        this.stop();

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.autoplay = Autoplay;

})(window.Zepto || window.jQuery, window, document);

/**
 * Navigation Plugin
 * @version 2.1.0
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {
    'use strict';

    /**
     * Creates the navigation plugin.
     * @class The Navigation Plugin
     * @param {Owl} carousel - The Owl Carousel.
     */
    var Navigation = function(carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Indicates whether the plugin is initialized or not.
         * @protected
         * @type {Boolean}
         */
        this._initialized = false;

        /**
         * The current paging indexes.
         * @protected
         * @type {Array}
         */
        this._pages = [];

        /**
         * All DOM elements of the user interface.
         * @protected
         * @type {Object}
         */
        this._controls = {};

        /**
         * Markup for an indicator.
         * @protected
         * @type {Array.<String>}
         */
        this._templates = [];

        /**
         * The carousel element.
         * @type {jQuery}
         */
        this.$element = this._core.$element;

        /**
         * Overridden methods of the carousel.
         * @protected
         * @type {Object}
         */
        this._overrides = {
            next: this._core.next,
            prev: this._core.prev,
            to: this._core.to
        };

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'prepared.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.push('<div class="' + this._core.settings.dotClass + '">' +
                        $(e.content).find('[data-dot]').addBack('[data-dot]').attr('data-dot') + '</div>');
                }
            }, this),
            'added.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.splice(e.position, 0, this._templates.pop());
                }
            }, this),
            'remove.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.splice(e.position, 1);
                }
            }, this),
            'changed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name == 'position') {
                    this.draw();
                }
            }, this),
            'initialized.owl.carousel': $.proxy(function(e) {
                if (e.namespace && !this._initialized) {
                    this._core.trigger('initialize', null, 'navigation');
                    this.initialize();
                    this.update();
                    this.draw();
                    this._initialized = true;
                    this._core.trigger('initialized', null, 'navigation');
                }
            }, this),
            'refreshed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._initialized) {
                    this._core.trigger('refresh', null, 'navigation');
                    this.update();
                    this.draw();
                    this._core.trigger('refreshed', null, 'navigation');
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, Navigation.Defaults, this._core.options);

        // register event handlers
        this.$element.on(this._handlers);
    };

    /**
     * Default options.
     * @public
     * @todo Rename `slideBy` to `navBy`
     */
    Navigation.Defaults = {
        nav: false,
        navText: ['prev', 'next'],
        navSpeed: false,
        navElement: 'div',
        navContainer: false,
        navContainerClass: 'owl-nav',
        navClass: ['owl-prev', 'owl-next'],
        slideBy: 1,
        dotClass: 'owl-dot',
        dotsClass: 'owl-dots',
        dots: true,
        dotsEach: false,
        dotsData: false,
        dotsSpeed: false,
        dotsContainer: false
    };

    /**
     * Initializes the layout of the plugin and extends the carousel.
     * @protected
     */
    Navigation.prototype.initialize = function() {
        var override,
            settings = this._core.settings;

        // create DOM structure for relative navigation
        this._controls.$relative = (settings.navContainer ? $(settings.navContainer) :
            $('<div>').addClass(settings.navContainerClass).appendTo(this.$element)).addClass('disabled');

        this._controls.$previous = $('<' + settings.navElement + '>')
            .addClass(settings.navClass[0])
            .html(settings.navText[0])
            .prependTo(this._controls.$relative)
            .on('click', $.proxy(function(e) {
                this.prev(settings.navSpeed);
            }, this));
        this._controls.$next = $('<' + settings.navElement + '>')
            .addClass(settings.navClass[1])
            .html(settings.navText[1])
            .appendTo(this._controls.$relative)
            .on('click', $.proxy(function(e) {
                this.next(settings.navSpeed);
            }, this));

        // create DOM structure for absolute navigation
        if (!settings.dotsData) {
            this._templates = [$('<div>')
                .addClass(settings.dotClass)
                .append($('<span>'))
                .prop('outerHTML')
            ];
        }

        this._controls.$absolute = (settings.dotsContainer ? $(settings.dotsContainer) :
            $('<div>').addClass(settings.dotsClass).appendTo(this.$element)).addClass('disabled');

        this._controls.$absolute.on('click', 'div', $.proxy(function(e) {
            var index = $(e.target).parent().is(this._controls.$absolute) ?
                $(e.target).index() : $(e.target).parent().index();

            e.preventDefault();

            this.to(index, settings.dotsSpeed);
        }, this));

        // override public methods of the carousel
        for (override in this._overrides) {
            this._core[override] = $.proxy(this[override], this);
        }
    };

    /**
     * Destroys the plugin.
     * @protected
     */
    Navigation.prototype.destroy = function() {
        var handler, control, property, override;

        for (handler in this._handlers) {
            this.$element.off(handler, this._handlers[handler]);
        }
        for (control in this._controls) {
            this._controls[control].remove();
        }
        for (override in this.overides) {
            this._core[override] = this._overrides[override];
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    /**
     * Updates the internal state.
     * @protected
     */
    Navigation.prototype.update = function() {
        var i, j, k,
            lower = this._core.clones().length / 2,
            upper = lower + this._core.items().length,
            maximum = this._core.maximum(true),
            settings = this._core.settings,
            size = settings.center || settings.autoWidth || settings.dotsData ?
            1 : settings.dotsEach || settings.items;

        if (settings.slideBy !== 'page') {
            settings.slideBy = Math.min(settings.slideBy, settings.items);
        }

        if (settings.dots || settings.slideBy == 'page') {
            this._pages = [];

            for (i = lower, j = 0, k = 0; i < upper; i++) {
                if (j >= size || j === 0) {
                    this._pages.push({
                        start: Math.min(maximum, i - lower),
                        end: i - lower + size - 1
                    });
                    if (Math.min(maximum, i - lower) === maximum) {
                        break;
                    }
                    j = 0, ++k;
                }
                j += this._core.mergers(this._core.relative(i));
            }
        }
    };

    /**
     * Draws the user interface.
     * @todo The option `dotsData` wont work.
     * @protected
     */
    Navigation.prototype.draw = function() {
        var difference,
            settings = this._core.settings,
            disabled = this._core.items().length <= settings.items,
            index = this._core.relative(this._core.current()),
            loop = settings.loop || settings.rewind;

        this._controls.$relative.toggleClass('disabled', !settings.nav || disabled);

        if (settings.nav) {
            this._controls.$previous.toggleClass('disabled', !loop && index <= this._core.minimum(true));
            this._controls.$next.toggleClass('disabled', !loop && index >= this._core.maximum(true));
        }

        this._controls.$absolute.toggleClass('disabled', !settings.dots || disabled);

        if (settings.dots) {
            difference = this._pages.length - this._controls.$absolute.children().length;

            if (settings.dotsData && difference !== 0) {
                this._controls.$absolute.html(this._templates.join(''));
            } else if (difference > 0) {
                this._controls.$absolute.append(new Array(difference + 1).join(this._templates[0]));
            } else if (difference < 0) {
                this._controls.$absolute.children().slice(difference).remove();
            }

            this._controls.$absolute.find('.active').removeClass('active');
            this._controls.$absolute.children().eq($.inArray(this.current(), this._pages)).addClass('active');
        }
    };

    /**
     * Extends event data.
     * @protected
     * @param {Event} event - The event object which gets thrown.
     */
    Navigation.prototype.onTrigger = function(event) {
        var settings = this._core.settings;

        event.page = {
            index: $.inArray(this.current(), this._pages),
            count: this._pages.length,
            size: settings && (settings.center || settings.autoWidth || settings.dotsData ?
                1 : settings.dotsEach || settings.items)
        };
    };

    /**
     * Gets the current page position of the carousel.
     * @protected
     * @returns {Number}
     */
    Navigation.prototype.current = function() {
        var current = this._core.relative(this._core.current());
        return $.grep(this._pages, $.proxy(function(page, index) {
            return page.start <= current && page.end >= current;
        }, this)).pop();
    };

    /**
     * Gets the current succesor/predecessor position.
     * @protected
     * @returns {Number}
     */
    Navigation.prototype.getPosition = function(successor) {
        var position, length,
            settings = this._core.settings;

        if (settings.slideBy == 'page') {
            position = $.inArray(this.current(), this._pages);
            length = this._pages.length;
            successor ? ++position : --position;
            position = this._pages[((position % length) + length) % length].start;
        } else {
            position = this._core.relative(this._core.current());
            length = this._core.items().length;
            successor ? position += settings.slideBy : position -= settings.slideBy;
        }

        return position;
    };

    /**
     * Slides to the next item or page.
     * @public
     * @param {Number} [speed=false] - The time in milliseconds for the transition.
     */
    Navigation.prototype.next = function(speed) {
        $.proxy(this._overrides.to, this._core)(this.getPosition(true), speed);
    };

    /**
     * Slides to the previous item or page.
     * @public
     * @param {Number} [speed=false] - The time in milliseconds for the transition.
     */
    Navigation.prototype.prev = function(speed) {
        $.proxy(this._overrides.to, this._core)(this.getPosition(false), speed);
    };

    /**
     * Slides to the specified item or page.
     * @public
     * @param {Number} position - The position of the item or page.
     * @param {Number} [speed] - The time in milliseconds for the transition.
     * @param {Boolean} [standard=false] - Whether to use the standard behaviour or not.
     */
    Navigation.prototype.to = function(position, speed, standard) {
        var length;

        if (!standard && this._pages.length) {
            length = this._pages.length;
            $.proxy(this._overrides.to, this._core)(this._pages[((position % length) + length) % length].start, speed);
        } else {
            $.proxy(this._overrides.to, this._core)(position, speed);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Navigation = Navigation;

})(window.Zepto || window.jQuery, window, document);

/**
 * Hash Plugin
 * @version 2.1.0
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {
    'use strict';

    /**
     * Creates the hash plugin.
     * @class The Hash Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var Hash = function(carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Hash index for the items.
         * @protected
         * @type {Object}
         */
        this._hashes = {};

        /**
         * The carousel element.
         * @type {jQuery}
         */
        this.$element = this._core.$element;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel': $.proxy(function(e) {
                if (e.namespace && this._core.settings.startPosition === 'URLHash') {
                    $(window).trigger('hashchange.owl.navigation');
                }
            }, this),
            'prepared.owl.carousel': $.proxy(function(e) {
                if (e.namespace) {
                    var hash = $(e.content).find('[data-hash]').addBack('[data-hash]').attr('data-hash');

                    if (!hash) {
                        return;
                    }

                    this._hashes[hash] = e.content;
                }
            }, this),
            'changed.owl.carousel': $.proxy(function(e) {
                if (e.namespace && e.property.name === 'position') {
                    var current = this._core.items(this._core.relative(this._core.current())),
                        hash = $.map(this._hashes, function(item, hash) {
                            return item === current ? hash : null;
                        }).join();

                    if (!hash || window.location.hash.slice(1) === hash) {
                        return;
                    }

                    window.location.hash = hash;
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, Hash.Defaults, this._core.options);

        // register the event handlers
        this.$element.on(this._handlers);

        // register event listener for hash navigation
        $(window).on('hashchange.owl.navigation', $.proxy(function(e) {
            var hash = window.location.hash.substring(1),
                items = this._core.$stage.children(),
                position = this._hashes[hash] && items.index(this._hashes[hash]);

            if (position === undefined || position === this._core.current()) {
                return;
            }

            this._core.to(this._core.relative(position), false, true);
        }, this));
    };

    /**
     * Default options.
     * @public
     */
    Hash.Defaults = {
        URLhashListener: false
    };

    /**
     * Destroys the plugin.
     * @public
     */
    Hash.prototype.destroy = function() {
        var handler, property;

        $(window).off('hashchange.owl.navigation');

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Hash = Hash;

})(window.Zepto || window.jQuery, window, document);

/**
 * Support Plugin
 *
 * @version 2.1.0
 * @author Vivid Planet Software GmbH
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
;
(function($, window, document, undefined) {

    var style = $('<support>').get(0).style,
        prefixes = 'Webkit Moz O ms'.split(' '),
        events = {
            transition: {
                end: {
                    WebkitTransition: 'webkitTransitionEnd',
                    MozTransition: 'transitionend',
                    OTransition: 'oTransitionEnd',
                    transition: 'transitionend'
                }
            },
            animation: {
                end: {
                    WebkitAnimation: 'webkitAnimationEnd',
                    MozAnimation: 'animationend',
                    OAnimation: 'oAnimationEnd',
                    animation: 'animationend'
                }
            }
        },
        tests = {
            csstransforms: function() {
                return !!test('transform');
            },
            csstransforms3d: function() {
                return !!test('perspective');
            },
            csstransitions: function() {
                return !!test('transition');
            },
            cssanimations: function() {
                return !!test('animation');
            }
        };

    function test(property, prefixed) {
        var result = false,
            upper = property.charAt(0).toUpperCase() + property.slice(1);

        $.each((property + ' ' + prefixes.join(upper + ' ') + upper).split(' '), function(i, property) {
            if (style[property] !== undefined) {
                result = prefixed ? property : true;
                return false;
            }
        });

        return result;
    }

    function prefixed(property) {
        return test(property, true);
    }

    if (tests.csstransitions()) {
        /* jshint -W053 */
        $.support.transition = new String(prefixed('transition'))
        $.support.transition.end = events.transition.end[$.support.transition];
    }

    if (tests.cssanimations()) {
        /* jshint -W053 */
        $.support.animation = new String(prefixed('animation'))
        $.support.animation.end = events.animation.end[$.support.animation];
    }

    if (tests.csstransforms()) {
        /* jshint -W053 */
        $.support.transform = new String(prefixed('transform'));
        $.support.transform3d = tests.csstransforms3d();
    }

})(window.Zepto || window.jQuery, window, document);

/**
 * tooltipster http://iamceege.github.io/tooltipster/
 * A rockin' custom tooltip jQuery plugin
 * Developed by Caleb Jacob and Louis Ameline
 * MIT license
 */
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module unless amdModuleId is set
        define(["jquery"], function(a0) {
            return (factory(a0));
        });
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require("jquery"));
    } else {
        factory(jQuery);
    }
}(this, function($) {

    // This file will be UMDified by a build task.

    var defaults = {
            animation: 'fade',
            animationDuration: 350,
            content: null,
            contentAsHTML: false,
            contentCloning: false,
            debug: true,
            delay: 300,
            delayTouch: [300, 500],
            functionInit: null,
            functionBefore: null,
            functionReady: null,
            functionAfter: null,
            functionFormat: null,
            IEmin: 6,
            interactive: false,
            multiple: false,
            // will default to document.body, or must be an element positioned at (0, 0)
            // in the document, typically like the very top views of an app.
            parent: null,
            plugins: ['sideTip'],
            repositionOnScroll: false,
            restoration: 'none',
            selfDestruction: true,
            theme: [],
            timer: 0,
            trackerInterval: 500,
            trackOrigin: false,
            trackTooltip: false,
            trigger: 'hover',
            triggerClose: {
                click: false,
                mouseleave: false,
                originClick: false,
                scroll: false,
                tap: false,
                touchleave: false
            },
            triggerOpen: {
                click: false,
                mouseenter: false,
                tap: false,
                touchstart: false
            },
            updateAnimation: 'rotate',
            zIndex: 9999999
        },
        // we'll avoid using the 'window' global as a good practice but npm's
        // jquery@<2.1.0 package actually requires a 'window' global, so not sure
        // it's useful at all
        win = (typeof window != 'undefined') ? window : null,
        // env will be proxied by the core for plugins to have access its properties
        env = {
            // detect if this device can trigger touch events. Better have a false
            // positive (unused listeners, that's ok) than a false negative.
            // https://github.com/Modernizr/Modernizr/blob/master/feature-detects/touchevents.js
            // http://stackoverflow.com/questions/4817029/whats-the-best-way-to-detect-a-touch-screen-device-using-javascript
            hasTouchCapability: !!(
                win &&
                ('ontouchstart' in win ||
                    (win.DocumentTouch && win.document instanceof win.DocumentTouch) ||
                    win.navigator.maxTouchPoints
                )
            ),
            hasTransitions: transitionSupport(),
            IE: false,
            // don't set manually, it will be updated by a build task after the manifest
            semVer: '4.2.5',
            window: win
        },
        core = function() {

            // core variables

            // the core emitters
            this.__$emitterPrivate = $({});
            this.__$emitterPublic = $({});
            this.__instancesLatestArr = [];
            // collects plugin constructors
            this.__plugins = {};
            // proxy env variables for plugins who might use them
            this._env = env;
        };

    // core methods
    core.prototype = {

        /**
         * A function to proxy the public methods of an object onto another
         *
         * @param {object} constructor The constructor to bridge
         * @param {object} obj The object that will get new methods (an instance or the core)
         * @param {string} pluginName A plugin name for the console log message
         * @return {core}
         * @private
         */
        __bridge: function(constructor, obj, pluginName) {

            // if it's not already bridged
            if (!obj[pluginName]) {

                var fn = function() {};
                fn.prototype = constructor;

                var pluginInstance = new fn();

                // the _init method has to exist in instance constructors but might be missing
                // in core constructors
                if (pluginInstance.__init) {
                    pluginInstance.__init(obj);
                }

                $.each(constructor, function(methodName, fn) {

                    // don't proxy "private" methods, only "protected" and public ones
                    if (methodName.indexOf('__') != 0) {

                        // if the method does not exist yet
                        if (!obj[methodName]) {

                            obj[methodName] = function() {
                                return pluginInstance[methodName].apply(pluginInstance, Array.prototype.slice.apply(arguments));
                            };

                            // remember to which plugin this method corresponds (several plugins may
                            // have methods of the same name, we need to be sure)
                            obj[methodName].bridged = pluginInstance;
                        } else if (defaults.debug) {

                            console.log('The ' + methodName + ' method of the ' + pluginName +
                                ' plugin conflicts with another plugin or native methods');
                        }
                    }
                });

                obj[pluginName] = pluginInstance;
            }

            return this;
        },

        /**
         * For mockup in Node env if need be, for testing purposes
         *
         * @return {core}
         * @private
         */
        __setWindow: function(window) {
            env.window = window;
            return this;
        },

        /**
         * Returns a ruler, a tool to help measure the size of a tooltip under
         * various settings. Meant for plugins
         * 
         * @see Ruler
         * @return {object} A Ruler instance
         * @protected
         */
        _getRuler: function($tooltip) {
            return new Ruler($tooltip);
        },

        /**
         * For internal use by plugins, if needed
         *
         * @return {core}
         * @protected
         */
        _off: function() {
            this.__$emitterPrivate.off.apply(this.__$emitterPrivate, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * For internal use by plugins, if needed
         *
         * @return {core}
         * @protected
         */
        _on: function() {
            this.__$emitterPrivate.on.apply(this.__$emitterPrivate, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * For internal use by plugins, if needed
         *
         * @return {core}
         * @protected
         */
        _one: function() {
            this.__$emitterPrivate.one.apply(this.__$emitterPrivate, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * Returns (getter) or adds (setter) a plugin
         *
         * @param {string|object} plugin Provide a string (in the full form
         * "namespace.name") to use as as getter, an object to use as a setter
         * @return {object|core}
         * @protected
         */
        _plugin: function(plugin) {

            var self = this;

            // getter
            if (typeof plugin == 'string') {

                var pluginName = plugin,
                    p = null;

                // if the namespace is provided, it's easy to search
                if (pluginName.indexOf('.') > 0) {
                    p = self.__plugins[pluginName];
                }
                // otherwise, return the first name that matches
                else {
                    $.each(self.__plugins, function(i, plugin) {

                        if (plugin.name.substring(plugin.name.length - pluginName.length - 1) == '.' + pluginName) {
                            p = plugin;
                            return false;
                        }
                    });
                }

                return p;
            }
            // setter
            else {

                // force namespaces
                if (plugin.name.indexOf('.') < 0) {
                    throw new Error('Plugins must be namespaced');
                }

                self.__plugins[plugin.name] = plugin;

                // if the plugin has core features
                if (plugin.core) {

                    // bridge non-private methods onto the core to allow new core methods
                    self.__bridge(plugin.core, self, plugin.name);
                }

                return this;
            }
        },

        /**
         * Trigger events on the core emitters
         * 
         * @returns {core}
         * @protected
         */
        _trigger: function() {

            var args = Array.prototype.slice.apply(arguments);

            if (typeof args[0] == 'string') {
                args[0] = { type: args[0] };
            }

            // note: the order of emitters matters
            this.__$emitterPrivate.trigger.apply(this.__$emitterPrivate, args);
            this.__$emitterPublic.trigger.apply(this.__$emitterPublic, args);

            return this;
        },

        /**
         * Returns instances of all tooltips in the page or an a given element
         *
         * @param {string|HTML object collection} selector optional Use this
         * parameter to restrict the set of objects that will be inspected
         * for the retrieval of instances. By default, all instances in the
         * page are returned.
         * @return {array} An array of instance objects
         * @public
         */
        instances: function(selector) {

            var instances = [],
                sel = selector || '.tooltipstered';

            $(sel).each(function() {

                var $this = $(this),
                    ns = $this.data('tooltipster-ns');

                if (ns) {

                    $.each(ns, function(i, namespace) {
                        instances.push($this.data(namespace));
                    });
                }
            });

            return instances;
        },

        /**
         * Returns the Tooltipster objects generated by the last initializing call
         *
         * @return {array} An array of instance objects
         * @public
         */
        instancesLatest: function() {
            return this.__instancesLatestArr;
        },

        /**
         * For public use only, not to be used by plugins (use ::_off() instead)
         *
         * @return {core}
         * @public
         */
        off: function() {
            this.__$emitterPublic.off.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * For public use only, not to be used by plugins (use ::_on() instead)
         *
         * @return {core}
         * @public
         */
        on: function() {
            this.__$emitterPublic.on.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * For public use only, not to be used by plugins (use ::_one() instead)
         * 
         * @return {core}
         * @public
         */
        one: function() {
            this.__$emitterPublic.one.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * Returns all HTML elements which have one or more tooltips
         *
         * @param {string} selector optional Use this to restrict the results
         * to the descendants of an element
         * @return {array} An array of HTML elements
         * @public
         */
        origins: function(selector) {

            var sel = selector ?
                selector + ' ' :
                '';

            return $(sel + '.tooltipstered').toArray();
        },

        /**
         * Change default options for all future instances
         *
         * @param {object} d The options that should be made defaults
         * @return {core}
         * @public
         */
        setDefaults: function(d) {
            $.extend(defaults, d);
            return this;
        },

        /**
         * For users to trigger their handlers on the public emitter
         * 
         * @returns {core}
         * @public
         */
        triggerHandler: function() {
            this.__$emitterPublic.triggerHandler.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            return this;
        }
    };

    // $.tooltipster will be used to call core methods
    $.tooltipster = new core();

    // the Tooltipster instance class (mind the capital T)
    $.Tooltipster = function(element, options) {

        // list of instance variables

        // stack of custom callbacks provided as parameters to API methods
        this.__callbacks = {
            close: [],
            open: []
        };
        // the schedule time of DOM removal
        this.__closingTime;
        // this will be the user content shown in the tooltip. A capital "C" is used
        // because there is also a method called content()
        this.__Content;
        // for the size tracker
        this.__contentBcr;
        // to disable the tooltip after destruction
        this.__destroyed = false;
        // we can't emit directly on the instance because if a method with the same
        // name as the event exists, it will be called by jQuery. Se we use a plain
        // object as emitter. This emitter is for internal use by plugins,
        // if needed.
        this.__$emitterPrivate = $({});
        // this emitter is for the user to listen to events without risking to mess
        // with our internal listeners
        this.__$emitterPublic = $({});
        this.__enabled = true;
        // the reference to the gc interval
        this.__garbageCollector;
        // various position and size data recomputed before each repositioning
        this.__Geometry;
        // the tooltip position, saved after each repositioning by a plugin
        this.__lastPosition;
        // a unique namespace per instance
        this.__namespace = 'tooltipster-' + Math.round(Math.random() * 1000000);
        this.__options;
        // will be used to support origins in scrollable areas
        this.__$originParents;
        this.__pointerIsOverOrigin = false;
        // to remove themes if needed
        this.__previousThemes = [];
        // the state can be either: appearing, stable, disappearing, closed
        this.__state = 'closed';
        // timeout references
        this.__timeouts = {
            close: [],
            open: null
        };
        // store touch events to be able to detect emulated mouse events
        this.__touchEvents = [];
        // the reference to the tracker interval
        this.__tracker = null;
        // the element to which this tooltip is associated
        this._$origin;
        // this will be the tooltip element (jQuery wrapped HTML element).
        // It's the job of a plugin to create it and append it to the DOM
        this._$tooltip;

        // launch
        this.__init(element, options);
    };

    $.Tooltipster.prototype = {

        /**
         * @param origin
         * @param options
         * @private
         */
        __init: function(origin, options) {

            var self = this;

            self._$origin = $(origin);
            self.__options = $.extend(true, {}, defaults, options);

            // some options may need to be reformatted
            self.__optionsFormat();

            // don't run on old IE if asked no to
            if (!env.IE ||
                env.IE >= self.__options.IEmin
            ) {

                // note: the content is null (empty) by default and can stay that
                // way if the plugin remains initialized but not fed any content. The
                // tooltip will just not appear.

                // let's save the initial value of the title attribute for later
                // restoration if need be.
                var initialTitle = null;

                // it will already have been saved in case of multiple tooltips
                if (self._$origin.data('tooltipster-initialTitle') === undefined) {

                    initialTitle = self._$origin.attr('title');

                    // we do not want initialTitle to be "undefined" because
                    // of how jQuery's .data() method works
                    if (initialTitle === undefined) initialTitle = null;

                    self._$origin.data('tooltipster-initialTitle', initialTitle);
                }

                // If content is provided in the options, it has precedence over the
                // title attribute.
                // Note: an empty string is considered content, only 'null' represents
                // the absence of content.
                // Also, an existing title="" attribute will result in an empty string
                // content
                if (self.__options.content !== null) {
                    self.__contentSet(self.__options.content);
                } else {

                    var selector = self._$origin.attr('data-tooltip-content'),
                        $el;

                    if (selector) {
                        $el = $(selector);
                    }

                    if ($el && $el[0]) {
                        self.__contentSet($el.first());
                    } else {
                        self.__contentSet(initialTitle);
                    }
                }

                self._$origin
                    // strip the title off of the element to prevent the default tooltips
                    // from popping up
                    .removeAttr('title')
                    // to be able to find all instances on the page later (upon window
                    // events in particular)
                    .addClass('tooltipstered');

                // set listeners on the origin
                self.__prepareOrigin();

                // set the garbage collector
                self.__prepareGC();

                // init plugins
                $.each(self.__options.plugins, function(i, pluginName) {
                    self._plug(pluginName);
                });

                // to detect swiping
                if (env.hasTouchCapability) {
                    $(env.window.document.body).on('touchmove.' + self.__namespace + '-triggerOpen', function(event) {
                        self._touchRecordEvent(event);
                    });
                }

                self
                // prepare the tooltip when it gets created. This event must
                // be fired by a plugin
                    ._on('created', function() {
                        self.__prepareTooltip();
                    })
                    // save position information when it's sent by a plugin
                    ._on('repositioned', function(e) {
                        self.__lastPosition = e.position;
                    });
            } else {
                self.__options.disabled = true;
            }
        },

        /**
         * Insert the content into the appropriate HTML element of the tooltip
         * 
         * @returns {self}
         * @private
         */
        __contentInsert: function() {

            var self = this,
                $el = self._$tooltip.find('.tooltipster-content'),
                formattedContent = self.__Content,
                format = function(content) {
                    formattedContent = content;
                };

            self._trigger({
                type: 'format',
                content: self.__Content,
                format: format
            });

            if (self.__options.functionFormat) {

                formattedContent = self.__options.functionFormat.call(
                    self,
                    self, { origin: self._$origin[0] },
                    self.__Content
                );
            }

            if (typeof formattedContent === 'string' && !self.__options.contentAsHTML) {
                $el.text(formattedContent);
            } else {
                $el
                    .empty()
                    .append(formattedContent);
            }

            return self;
        },

        /**
         * Save the content, cloning it beforehand if need be
         * 
         * @param content
         * @returns {self}
         * @private
         */
        __contentSet: function(content) {

            // clone if asked. Cloning the object makes sure that each instance has its
            // own version of the content (in case a same object were provided for several
            // instances)
            // reminder: typeof null === object
            if (content instanceof $ && this.__options.contentCloning) {
                content = content.clone(true);
            }

            this.__Content = content;

            this._trigger({
                type: 'updated',
                content: content
            });

            return this;
        },

        /**
         * Error message about a method call made after destruction
         * 
         * @private
         */
        __destroyError: function() {
            throw new Error('This tooltip has been destroyed and cannot execute your method call.');
        },

        /**
         * Gather all information about dimensions and available space,
         * called before every repositioning
         * 
         * @private
         * @returns {object}
         */
        __geometry: function() {

            var self = this,
                $target = self._$origin,
                originIsArea = self._$origin.is('area');

            // if this._$origin is a map area, the target we'll need
            // the dimensions of is actually the image using the map,
            // not the area itself
            if (originIsArea) {

                var mapName = self._$origin.parent().attr('name');

                $target = $('img[usemap="#' + mapName + '"]');
            }

            var bcr = $target[0].getBoundingClientRect(),
                $document = $(env.window.document),
                $window = $(env.window),
                $parent = $target,
                // some useful properties of important elements
                geo = {
                    // available space for the tooltip, see down below
                    available: {
                        document: null,
                        window: null
                    },
                    document: {
                        size: {
                            height: $document.height(),
                            width: $document.width()
                        }
                    },
                    window: {
                        scroll: {
                            // the second ones are for IE compatibility
                            left: env.window.scrollX || env.window.document.documentElement.scrollLeft,
                            top: env.window.scrollY || env.window.document.documentElement.scrollTop
                        },
                        size: {
                            height: $window.height(),
                            width: $window.width()
                        }
                    },
                    origin: {
                        // the origin has a fixed lineage if itself or one of its
                        // ancestors has a fixed position
                        fixedLineage: false,
                        // relative to the document
                        offset: {},
                        size: {
                            height: bcr.bottom - bcr.top,
                            width: bcr.right - bcr.left
                        },
                        usemapImage: originIsArea ? $target[0] : null,
                        // relative to the window
                        windowOffset: {
                            bottom: bcr.bottom,
                            left: bcr.left,
                            right: bcr.right,
                            top: bcr.top
                        }
                    }
                },
                geoFixed = false;

            // if the element is a map area, some properties may need
            // to be recalculated
            if (originIsArea) {

                var shape = self._$origin.attr('shape'),
                    coords = self._$origin.attr('coords');

                if (coords) {

                    coords = coords.split(',');

                    $.map(coords, function(val, i) {
                        coords[i] = parseInt(val);
                    });
                }

                // if the image itself is the area, nothing more to do
                if (shape != 'default') {

                    switch (shape) {

                        case 'circle':

                            var circleCenterLeft = coords[0],
                                circleCenterTop = coords[1],
                                circleRadius = coords[2],
                                areaTopOffset = circleCenterTop - circleRadius,
                                areaLeftOffset = circleCenterLeft - circleRadius;

                            geo.origin.size.height = circleRadius * 2;
                            geo.origin.size.width = geo.origin.size.height;

                            geo.origin.windowOffset.left += areaLeftOffset;
                            geo.origin.windowOffset.top += areaTopOffset;

                            break;

                        case 'rect':

                            var areaLeft = coords[0],
                                areaTop = coords[1],
                                areaRight = coords[2],
                                areaBottom = coords[3];

                            geo.origin.size.height = areaBottom - areaTop;
                            geo.origin.size.width = areaRight - areaLeft;

                            geo.origin.windowOffset.left += areaLeft;
                            geo.origin.windowOffset.top += areaTop;

                            break;

                        case 'poly':

                            var areaSmallestX = 0,
                                areaSmallestY = 0,
                                areaGreatestX = 0,
                                areaGreatestY = 0,
                                arrayAlternate = 'even';

                            for (var i = 0; i < coords.length; i++) {

                                var areaNumber = coords[i];

                                if (arrayAlternate == 'even') {

                                    if (areaNumber > areaGreatestX) {

                                        areaGreatestX = areaNumber;

                                        if (i === 0) {
                                            areaSmallestX = areaGreatestX;
                                        }
                                    }

                                    if (areaNumber < areaSmallestX) {
                                        areaSmallestX = areaNumber;
                                    }

                                    arrayAlternate = 'odd';
                                } else {
                                    if (areaNumber > areaGreatestY) {

                                        areaGreatestY = areaNumber;

                                        if (i == 1) {
                                            areaSmallestY = areaGreatestY;
                                        }
                                    }

                                    if (areaNumber < areaSmallestY) {
                                        areaSmallestY = areaNumber;
                                    }

                                    arrayAlternate = 'even';
                                }
                            }

                            geo.origin.size.height = areaGreatestY - areaSmallestY;
                            geo.origin.size.width = areaGreatestX - areaSmallestX;

                            geo.origin.windowOffset.left += areaSmallestX;
                            geo.origin.windowOffset.top += areaSmallestY;

                            break;
                    }
                }
            }

            // user callback through an event
            var edit = function(r) {
                geo.origin.size.height = r.height,
                    geo.origin.windowOffset.left = r.left,
                    geo.origin.windowOffset.top = r.top,
                    geo.origin.size.width = r.width
            };

            self._trigger({
                type: 'geometry',
                edit: edit,
                geometry: {
                    height: geo.origin.size.height,
                    left: geo.origin.windowOffset.left,
                    top: geo.origin.windowOffset.top,
                    width: geo.origin.size.width
                }
            });

            // calculate the remaining properties with what we got

            geo.origin.windowOffset.right = geo.origin.windowOffset.left + geo.origin.size.width;
            geo.origin.windowOffset.bottom = geo.origin.windowOffset.top + geo.origin.size.height;

            geo.origin.offset.left = geo.origin.windowOffset.left + geo.window.scroll.left;
            geo.origin.offset.top = geo.origin.windowOffset.top + geo.window.scroll.top;
            geo.origin.offset.bottom = geo.origin.offset.top + geo.origin.size.height;
            geo.origin.offset.right = geo.origin.offset.left + geo.origin.size.width;

            // the space that is available to display the tooltip relatively to the document
            geo.available.document = {
                bottom: {
                    height: geo.document.size.height - geo.origin.offset.bottom,
                    width: geo.document.size.width
                },
                left: {
                    height: geo.document.size.height,
                    width: geo.origin.offset.left
                },
                right: {
                    height: geo.document.size.height,
                    width: geo.document.size.width - geo.origin.offset.right
                },
                top: {
                    height: geo.origin.offset.top,
                    width: geo.document.size.width
                }
            };

            // the space that is available to display the tooltip relatively to the viewport
            // (the resulting values may be negative if the origin overflows the viewport)
            geo.available.window = {
                bottom: {
                    // the inner max is here to make sure the available height is no bigger
                    // than the viewport height (when the origin is off screen at the top).
                    // The outer max just makes sure that the height is not negative (when
                    // the origin overflows at the bottom).
                    height: Math.max(geo.window.size.height - Math.max(geo.origin.windowOffset.bottom, 0), 0),
                    width: geo.window.size.width
                },
                left: {
                    height: geo.window.size.height,
                    width: Math.max(geo.origin.windowOffset.left, 0)
                },
                right: {
                    height: geo.window.size.height,
                    width: Math.max(geo.window.size.width - Math.max(geo.origin.windowOffset.right, 0), 0)
                },
                top: {
                    height: Math.max(geo.origin.windowOffset.top, 0),
                    width: geo.window.size.width
                }
            };

            while ($parent[0].tagName.toLowerCase() != 'html') {

                if ($parent.css('position') == 'fixed') {
                    geo.origin.fixedLineage = true;
                    break;
                }

                $parent = $parent.parent();
            }

            return geo;
        },

        /**
         * Some options may need to be formated before being used
         * 
         * @returns {self}
         * @private
         */
        __optionsFormat: function() {

            if (typeof this.__options.animationDuration == 'number') {
                this.__options.animationDuration = [this.__options.animationDuration, this.__options.animationDuration];
            }

            if (typeof this.__options.delay == 'number') {
                this.__options.delay = [this.__options.delay, this.__options.delay];
            }

            if (typeof this.__options.delayTouch == 'number') {
                this.__options.delayTouch = [this.__options.delayTouch, this.__options.delayTouch];
            }

            if (typeof this.__options.theme == 'string') {
                this.__options.theme = [this.__options.theme];
            }

            // determine the future parent
            if (this.__options.parent === null) {
                this.__options.parent = $(env.window.document.body);
            } else if (typeof this.__options.parent == 'string') {
                this.__options.parent = $(this.__options.parent);
            }

            if (this.__options.trigger == 'hover') {

                this.__options.triggerOpen = {
                    mouseenter: true,
                    touchstart: true
                };

                this.__options.triggerClose = {
                    mouseleave: true,
                    originClick: true,
                    touchleave: true
                };
            } else if (this.__options.trigger == 'click') {

                this.__options.triggerOpen = {
                    click: true,
                    tap: true
                };

                this.__options.triggerClose = {
                    click: true,
                    tap: true
                };
            }

            // for the plugins
            this._trigger('options');

            return this;
        },

        /**
         * Schedules or cancels the garbage collector task
         *
         * @returns {self}
         * @private
         */
        __prepareGC: function() {

            var self = this;

            // in case the selfDestruction option has been changed by a method call
            if (self.__options.selfDestruction) {

                // the GC task
                self.__garbageCollector = setInterval(function() {

                    var now = new Date().getTime();

                    // forget the old events
                    self.__touchEvents = $.grep(self.__touchEvents, function(event, i) {
                        // 1 minute
                        return now - event.time > 60000;
                    });

                    // auto-destruct if the origin is gone
                    if (!bodyContains(self._$origin)) {

                        self.close(function() {
                            self.destroy();
                        });
                    }
                }, 20000);
            } else {
                clearInterval(self.__garbageCollector);
            }

            return self;
        },

        /**
         * Sets listeners on the origin if the open triggers require them.
         * Unlike the listeners set at opening time, these ones
         * remain even when the tooltip is closed. It has been made a
         * separate method so it can be called when the triggers are
         * changed in the options. Closing is handled in _open()
         * because of the bindings that may be needed on the tooltip
         * itself
         *
         * @returns {self}
         * @private
         */
        __prepareOrigin: function() {

            var self = this;

            // in case we're resetting the triggers
            self._$origin.off('.' + self.__namespace + '-triggerOpen');

            // if the device is touch capable, even if only mouse triggers
            // are asked, we need to listen to touch events to know if the mouse
            // events are actually emulated (so we can ignore them)
            if (env.hasTouchCapability) {

                self._$origin.on(
                    'touchstart.' + self.__namespace + '-triggerOpen ' +
                    'touchend.' + self.__namespace + '-triggerOpen ' +
                    'touchcancel.' + self.__namespace + '-triggerOpen',
                    function(event) {
                        self._touchRecordEvent(event);
                    }
                );
            }

            // mouse click and touch tap work the same way
            if (self.__options.triggerOpen.click ||
                (self.__options.triggerOpen.tap && env.hasTouchCapability)
            ) {

                var eventNames = '';
                if (self.__options.triggerOpen.click) {
                    eventNames += 'click.' + self.__namespace + '-triggerOpen ';
                }
                if (self.__options.triggerOpen.tap && env.hasTouchCapability) {
                    eventNames += 'touchend.' + self.__namespace + '-triggerOpen';
                }

                self._$origin.on(eventNames, function(event) {
                    if (self._touchIsMeaningfulEvent(event)) {
                        self._open(event);
                    }
                });
            }

            // mouseenter and touch start work the same way
            if (self.__options.triggerOpen.mouseenter ||
                (self.__options.triggerOpen.touchstart && env.hasTouchCapability)
            ) {

                var eventNames = '';
                if (self.__options.triggerOpen.mouseenter) {
                    eventNames += 'mouseenter.' + self.__namespace + '-triggerOpen ';
                }
                if (self.__options.triggerOpen.touchstart && env.hasTouchCapability) {
                    eventNames += 'touchstart.' + self.__namespace + '-triggerOpen';
                }

                self._$origin.on(eventNames, function(event) {
                    if (self._touchIsTouchEvent(event) ||
                        !self._touchIsEmulatedEvent(event)
                    ) {
                        self.__pointerIsOverOrigin = true;
                        self._openShortly(event);
                    }
                });
            }

            // info for the mouseleave/touchleave close triggers when they use a delay
            if (self.__options.triggerClose.mouseleave ||
                (self.__options.triggerClose.touchleave && env.hasTouchCapability)
            ) {

                var eventNames = '';
                if (self.__options.triggerClose.mouseleave) {
                    eventNames += 'mouseleave.' + self.__namespace + '-triggerOpen ';
                }
                if (self.__options.triggerClose.touchleave && env.hasTouchCapability) {
                    eventNames += 'touchend.' + self.__namespace + '-triggerOpen touchcancel.' + self.__namespace + '-triggerOpen';
                }

                self._$origin.on(eventNames, function(event) {

                    if (self._touchIsMeaningfulEvent(event)) {
                        self.__pointerIsOverOrigin = false;
                    }
                });
            }

            return self;
        },

        /**
         * Do the things that need to be done only once after the tooltip
         * HTML element it has been created. It has been made a separate
         * method so it can be called when options are changed. Remember
         * that the tooltip may actually exist in the DOM before it is
         * opened, and present after it has been closed: it's the display
         * plugin that takes care of handling it.
         * 
         * @returns {self}
         * @private
         */
        __prepareTooltip: function() {

            var self = this,
                p = self.__options.interactive ? 'auto' : '';

            // this will be useful to know quickly if the tooltip is in
            // the DOM or not 
            self._$tooltip
                .attr('id', self.__namespace)
                .css({
                    // pointer events
                    'pointer-events': p,
                    zIndex: self.__options.zIndex
                });

            // themes
            // remove the old ones and add the new ones
            $.each(self.__previousThemes, function(i, theme) {
                self._$tooltip.removeClass(theme);
            });
            $.each(self.__options.theme, function(i, theme) {
                self._$tooltip.addClass(theme);
            });

            self.__previousThemes = $.merge([], self.__options.theme);

            return self;
        },

        /**
         * Handles the scroll on any of the parents of the origin (when the
         * tooltip is open)
         *
         * @param {object} event
         * @returns {self}
         * @private
         */
        __scrollHandler: function(event) {

            var self = this;

            if (self.__options.triggerClose.scroll) {
                self._close(event);
            } else {

                // if the origin or tooltip have been removed: do nothing, the tracker will
                // take care of it later
                if (bodyContains(self._$origin) && bodyContains(self._$tooltip)) {

                    var geo = null;

                    // if the scroll happened on the window
                    if (event.target === env.window.document) {

                        // if the origin has a fixed lineage, window scroll will have no
                        // effect on its position nor on the position of the tooltip
                        if (!self.__Geometry.origin.fixedLineage) {

                            // we don't need to do anything unless repositionOnScroll is true
                            // because the tooltip will already have moved with the window
                            // (and of course with the origin)
                            if (self.__options.repositionOnScroll) {
                                self.reposition(event);
                            }
                        }
                    }
                    // if the scroll happened on another parent of the tooltip, it means
                    // that it's in a scrollable area and now needs to have its position
                    // adjusted or recomputed, depending ont the repositionOnScroll
                    // option. Also, if the origin is partly hidden due to a parent that
                    // hides its overflow, we'll just hide (not close) the tooltip.
                    else {

                        geo = self.__geometry();

                        var overflows = false;

                        // a fixed position origin is not affected by the overflow hiding
                        // of a parent
                        if (self._$origin.css('position') != 'fixed') {

                            self.__$originParents.each(function(i, el) {

                                var $el = $(el),
                                    overflowX = $el.css('overflow-x'),
                                    overflowY = $el.css('overflow-y');

                                if (overflowX != 'visible' || overflowY != 'visible') {

                                    var bcr = el.getBoundingClientRect();

                                    if (overflowX != 'visible') {

                                        if (geo.origin.windowOffset.left < bcr.left ||
                                            geo.origin.windowOffset.right > bcr.right
                                        ) {
                                            overflows = true;
                                            return false;
                                        }
                                    }

                                    if (overflowY != 'visible') {

                                        if (geo.origin.windowOffset.top < bcr.top ||
                                            geo.origin.windowOffset.bottom > bcr.bottom
                                        ) {
                                            overflows = true;
                                            return false;
                                        }
                                    }
                                }

                                // no need to go further if fixed, for the same reason as above
                                if ($el.css('position') == 'fixed') {
                                    return false;
                                }
                            });
                        }

                        if (overflows) {
                            self._$tooltip.css('visibility', 'hidden');
                        } else {

                            self._$tooltip.css('visibility', 'visible');

                            // reposition
                            if (self.__options.repositionOnScroll) {
                                self.reposition(event);
                            }
                            // or just adjust offset
                            else {

                                // we have to use offset and not windowOffset because this way,
                                // only the scroll distance of the scrollable areas are taken into
                                // account (the scrolltop value of the main window must be
                                // ignored since the tooltip already moves with it)
                                var offsetLeft = geo.origin.offset.left - self.__Geometry.origin.offset.left,
                                    offsetTop = geo.origin.offset.top - self.__Geometry.origin.offset.top;

                                // add the offset to the position initially computed by the display plugin
                                self._$tooltip.css({
                                    left: self.__lastPosition.coord.left + offsetLeft,
                                    top: self.__lastPosition.coord.top + offsetTop
                                });
                            }
                        }
                    }

                    self._trigger({
                        type: 'scroll',
                        event: event,
                        geo: geo
                    });
                }
            }

            return self;
        },

        /**
         * Changes the state of the tooltip
         *
         * @param {string} state
         * @returns {self}
         * @private
         */
        __stateSet: function(state) {

            this.__state = state;

            this._trigger({
                type: 'state',
                state: state
            });

            return this;
        },

        /**
         * Clear appearance timeouts
         *
         * @returns {self}
         * @private
         */
        __timeoutsClear: function() {

            // there is only one possible open timeout: the delayed opening
            // when the mouseenter/touchstart open triggers are used
            clearTimeout(this.__timeouts.open);
            this.__timeouts.open = null;

            // ... but several close timeouts: the delayed closing when the
            // mouseleave close trigger is used and the timer option
            $.each(this.__timeouts.close, function(i, timeout) {
                clearTimeout(timeout);
            });
            this.__timeouts.close = [];

            return this;
        },

        /**
         * Start the tracker that will make checks at regular intervals
         * 
         * @returns {self}
         * @private
         */
        __trackerStart: function() {

            var self = this,
                $content = self._$tooltip.find('.tooltipster-content');

            // get the initial content size
            if (self.__options.trackTooltip) {
                self.__contentBcr = $content[0].getBoundingClientRect();
            }

            self.__tracker = setInterval(function() {

                // if the origin or tooltip elements have been removed.
                // Note: we could destroy the instance now if the origin has
                // been removed but we'll leave that task to our garbage collector
                if (!bodyContains(self._$origin) || !bodyContains(self._$tooltip)) {
                    self._close();
                }
                // if everything is alright
                else {

                    // compare the former and current positions of the origin to reposition
                    // the tooltip if need be
                    if (self.__options.trackOrigin) {

                        var g = self.__geometry(),
                            identical = false;

                        // compare size first (a change requires repositioning too)
                        if (areEqual(g.origin.size, self.__Geometry.origin.size)) {

                            // for elements that have a fixed lineage (see __geometry()), we track the
                            // top and left properties (relative to window)
                            if (self.__Geometry.origin.fixedLineage) {
                                if (areEqual(g.origin.windowOffset, self.__Geometry.origin.windowOffset)) {
                                    identical = true;
                                }
                            }
                            // otherwise, track total offset (relative to document)
                            else {
                                if (areEqual(g.origin.offset, self.__Geometry.origin.offset)) {
                                    identical = true;
                                }
                            }
                        }

                        if (!identical) {

                            // close the tooltip when using the mouseleave close trigger
                            // (see https://github.com/iamceege/tooltipster/pull/253)
                            if (self.__options.triggerClose.mouseleave) {
                                self._close();
                            } else {
                                self.reposition();
                            }
                        }
                    }

                    if (self.__options.trackTooltip) {

                        var currentBcr = $content[0].getBoundingClientRect();

                        if (currentBcr.height !== self.__contentBcr.height ||
                            currentBcr.width !== self.__contentBcr.width
                        ) {
                            self.reposition();
                            self.__contentBcr = currentBcr;
                        }
                    }
                }
            }, self.__options.trackerInterval);

            return self;
        },

        /**
         * Closes the tooltip (after the closing delay)
         * 
         * @param event
         * @param callback
         * @param force Set to true to override a potential refusal of the user's function
         * @returns {self}
         * @protected
         */
        _close: function(event, callback, force) {

            var self = this,
                ok = true;

            self._trigger({
                type: 'close',
                event: event,
                stop: function() {
                    ok = false;
                }
            });

            // a destroying tooltip (force == true) may not refuse to close
            if (ok || force) {

                // save the method custom callback and cancel any open method custom callbacks
                if (callback) self.__callbacks.close.push(callback);
                self.__callbacks.open = [];

                // clear open/close timeouts
                self.__timeoutsClear();

                var finishCallbacks = function() {

                    // trigger any close method custom callbacks and reset them
                    $.each(self.__callbacks.close, function(i, c) {
                        c.call(self, self, {
                            event: event,
                            origin: self._$origin[0]
                        });
                    });

                    self.__callbacks.close = [];
                };

                if (self.__state != 'closed') {

                    var necessary = true,
                        d = new Date(),
                        now = d.getTime(),
                        newClosingTime = now + self.__options.animationDuration[1];

                    // the tooltip may already already be disappearing, but if a new
                    // call to close() is made after the animationDuration was changed
                    // to 0 (for example), we ought to actually close it sooner than
                    // previously scheduled. In that case it should be noted that the
                    // browser will not adapt the animation duration to the new
                    // animationDuration that was set after the start of the closing
                    // animation.
                    // Note: the same thing could be considered at opening, but is not
                    // really useful since the tooltip is actually opened immediately
                    // upon a call to _open(). Since it would not make the opening
                    // animation finish sooner, its sole impact would be to trigger the
                    // state event and the open callbacks sooner than the actual end of
                    // the opening animation, which is not great.
                    if (self.__state == 'disappearing') {

                        if (newClosingTime > self.__closingTime
                            // in case closing is actually overdue because the script
                            // execution was suspended. See #679
                            &&
                            self.__options.animationDuration[1] > 0
                        ) {
                            necessary = false;
                        }
                    }

                    if (necessary) {

                        self.__closingTime = newClosingTime;

                        if (self.__state != 'disappearing') {
                            self.__stateSet('disappearing');
                        }

                        var finish = function() {

                            // stop the tracker
                            clearInterval(self.__tracker);

                            // a "beforeClose" option has been asked several times but would
                            // probably useless since the content element is still accessible
                            // via ::content(), and because people can always use listeners
                            // inside their content to track what's going on. For the sake of
                            // simplicity, this has been denied. Bur for the rare people who
                            // really need the option (for old browsers or for the case where
                            // detaching the content is actually destructive, for file or
                            // password inputs for example), this event will do the work.
                            self._trigger({
                                type: 'closing',
                                event: event
                            });

                            // unbind listeners which are no longer needed

                            self._$tooltip
                                .off('.' + self.__namespace + '-triggerClose')
                                .removeClass('tooltipster-dying');

                            // orientationchange, scroll and resize listeners
                            $(env.window).off('.' + self.__namespace + '-triggerClose');

                            // scroll listeners
                            self.__$originParents.each(function(i, el) {
                                $(el).off('scroll.' + self.__namespace + '-triggerClose');
                            });
                            // clear the array to prevent memory leaks
                            self.__$originParents = null;

                            $(env.window.document.body).off('.' + self.__namespace + '-triggerClose');

                            self._$origin.off('.' + self.__namespace + '-triggerClose');

                            self._off('dismissable');

                            // a plugin that would like to remove the tooltip from the
                            // DOM when closed should bind on this
                            self.__stateSet('closed');

                            // trigger event
                            self._trigger({
                                type: 'after',
                                event: event
                            });

                            // call our constructor custom callback function
                            if (self.__options.functionAfter) {
                                self.__options.functionAfter.call(self, self, {
                                    event: event,
                                    origin: self._$origin[0]
                                });
                            }

                            // call our method custom callbacks functions
                            finishCallbacks();
                        };

                        if (env.hasTransitions) {

                            self._$tooltip.css({
                                '-moz-animation-duration': self.__options.animationDuration[1] + 'ms',
                                '-ms-animation-duration': self.__options.animationDuration[1] + 'ms',
                                '-o-animation-duration': self.__options.animationDuration[1] + 'ms',
                                '-webkit-animation-duration': self.__options.animationDuration[1] + 'ms',
                                'animation-duration': self.__options.animationDuration[1] + 'ms',
                                'transition-duration': self.__options.animationDuration[1] + 'ms'
                            });

                            self._$tooltip
                                // clear both potential open and close tasks
                                .clearQueue()
                                .removeClass('tooltipster-show')
                                // for transitions only
                                .addClass('tooltipster-dying');

                            if (self.__options.animationDuration[1] > 0) {
                                self._$tooltip.delay(self.__options.animationDuration[1]);
                            }

                            self._$tooltip.queue(finish);
                        } else {

                            self._$tooltip
                                .stop()
                                .fadeOut(self.__options.animationDuration[1], finish);
                        }
                    }
                }
                // if the tooltip is already closed, we still need to trigger
                // the method custom callbacks
                else {
                    finishCallbacks();
                }
            }

            return self;
        },

        /**
         * For internal use by plugins, if needed
         * 
         * @returns {self}
         * @protected
         */
        _off: function() {
            this.__$emitterPrivate.off.apply(this.__$emitterPrivate, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * For internal use by plugins, if needed
         *
         * @returns {self}
         * @protected
         */
        _on: function() {
            this.__$emitterPrivate.on.apply(this.__$emitterPrivate, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * For internal use by plugins, if needed
         *
         * @returns {self}
         * @protected
         */
        _one: function() {
            this.__$emitterPrivate.one.apply(this.__$emitterPrivate, Array.prototype.slice.apply(arguments));
            return this;
        },

        /**
         * Opens the tooltip right away.
         *
         * @param event
         * @param callback Will be called when the opening animation is over
         * @returns {self}
         * @protected
         */
        _open: function(event, callback) {

            var self = this;

            // if the destruction process has not begun and if this was not
            // triggered by an unwanted emulated click event
            if (!self.__destroying) {

                // check that the origin is still in the DOM
                if (bodyContains(self._$origin)
                    // if the tooltip is enabled
                    &&
                    self.__enabled
                ) {

                    var ok = true;

                    // if the tooltip is not open yet, we need to call functionBefore.
                    // otherwise we can jst go on
                    if (self.__state == 'closed') {

                        // trigger an event. The event.stop function allows the callback
                        // to prevent the opening of the tooltip
                        self._trigger({
                            type: 'before',
                            event: event,
                            stop: function() {
                                ok = false;
                            }
                        });

                        if (ok && self.__options.functionBefore) {

                            // call our custom function before continuing
                            ok = self.__options.functionBefore.call(self, self, {
                                event: event,
                                origin: self._$origin[0]
                            });
                        }
                    }

                    if (ok !== false) {

                        // if there is some content
                        if (self.__Content !== null) {

                            // save the method callback and cancel close method callbacks
                            if (callback) {
                                self.__callbacks.open.push(callback);
                            }
                            self.__callbacks.close = [];

                            // get rid of any appearance timeouts
                            self.__timeoutsClear();

                            var extraTime,
                                finish = function() {

                                    if (self.__state != 'stable') {
                                        self.__stateSet('stable');
                                    }

                                    // trigger any open method custom callbacks and reset them
                                    $.each(self.__callbacks.open, function(i, c) {
                                        c.call(self, self, {
                                            origin: self._$origin[0],
                                            tooltip: self._$tooltip[0]
                                        });
                                    });

                                    self.__callbacks.open = [];
                                };

                            // if the tooltip is already open
                            if (self.__state !== 'closed') {

                                // the timer (if any) will start (or restart) right now
                                extraTime = 0;

                                // if it was disappearing, cancel that
                                if (self.__state === 'disappearing') {

                                    self.__stateSet('appearing');

                                    if (env.hasTransitions) {

                                        self._$tooltip
                                            .clearQueue()
                                            .removeClass('tooltipster-dying')
                                            .addClass('tooltipster-show');

                                        if (self.__options.animationDuration[0] > 0) {
                                            self._$tooltip.delay(self.__options.animationDuration[0]);
                                        }

                                        self._$tooltip.queue(finish);
                                    } else {
                                        // in case the tooltip was currently fading out, bring it back
                                        // to life
                                        self._$tooltip
                                            .stop()
                                            .fadeIn(finish);
                                    }
                                }
                                // if the tooltip is already open, we still need to trigger the method
                                // custom callback
                                else if (self.__state == 'stable') {
                                    finish();
                                }
                            }
                            // if the tooltip isn't already open, open it
                            else {

                                // a plugin must bind on this and store the tooltip in this._$tooltip
                                self.__stateSet('appearing');

                                // the timer (if any) will start when the tooltip has fully appeared
                                // after its transition
                                extraTime = self.__options.animationDuration[0];

                                // insert the content inside the tooltip
                                self.__contentInsert();

                                // reposition the tooltip and attach to the DOM
                                self.reposition(event, true);

                                // animate in the tooltip. If the display plugin wants no css
                                // animations, it may override the animation option with a
                                // dummy value that will produce no effect
                                if (env.hasTransitions) {

                                    // note: there seems to be an issue with start animations which
                                    // are randomly not played on fast devices in both Chrome and FF,
                                    // couldn't find a way to solve it yet. It seems that applying
                                    // the classes before appending to the DOM helps a little, but
                                    // it messes up some CSS transitions. The issue almost never
                                    // happens when delay[0]==0 though
                                    self._$tooltip
                                        .addClass('tooltipster-' + self.__options.animation)
                                        .addClass('tooltipster-initial')
                                        .css({
                                            '-moz-animation-duration': self.__options.animationDuration[0] + 'ms',
                                            '-ms-animation-duration': self.__options.animationDuration[0] + 'ms',
                                            '-o-animation-duration': self.__options.animationDuration[0] + 'ms',
                                            '-webkit-animation-duration': self.__options.animationDuration[0] + 'ms',
                                            'animation-duration': self.__options.animationDuration[0] + 'ms',
                                            'transition-duration': self.__options.animationDuration[0] + 'ms'
                                        });

                                    setTimeout(
                                        function() {

                                            // a quick hover may have already triggered a mouseleave
                                            if (self.__state != 'closed') {

                                                self._$tooltip
                                                    .addClass('tooltipster-show')
                                                    .removeClass('tooltipster-initial');

                                                if (self.__options.animationDuration[0] > 0) {
                                                    self._$tooltip.delay(self.__options.animationDuration[0]);
                                                }

                                                self._$tooltip.queue(finish);
                                            }
                                        },
                                        0
                                    );
                                } else {

                                    // old browsers will have to live with this
                                    self._$tooltip
                                        .css('display', 'none')
                                        .fadeIn(self.__options.animationDuration[0], finish);
                                }

                                // checks if the origin is removed while the tooltip is open
                                self.__trackerStart();

                                // NOTE: the listeners below have a '-triggerClose' namespace
                                // because we'll remove them when the tooltip closes (unlike
                                // the '-triggerOpen' listeners). So some of them are actually
                                // not about close triggers, rather about positioning.

                                $(env.window)
                                    // reposition on resize
                                    .on('resize.' + self.__namespace + '-triggerClose', function(e) {

                                        var $ae = $(document.activeElement);

                                        // reposition only if the resize event was not triggered upon the opening
                                        // of a virtual keyboard due to an input field being focused within the tooltip
                                        // (otherwise the repositioning would lose the focus)
                                        if ((!$ae.is('input') && !$ae.is('textarea')) ||
                                            !$.contains(self._$tooltip[0], $ae[0])
                                        ) {
                                            self.reposition(e);
                                        }
                                    })
                                    // same as below for parents
                                    .on('scroll.' + self.__namespace + '-triggerClose', function(e) {
                                        self.__scrollHandler(e);
                                    });

                                self.__$originParents = self._$origin.parents();

                                // scrolling may require the tooltip to be moved or even
                                // repositioned in some cases
                                self.__$originParents.each(function(i, parent) {

                                    $(parent).on('scroll.' + self.__namespace + '-triggerClose', function(e) {
                                        self.__scrollHandler(e);
                                    });
                                });

                                if (self.__options.triggerClose.mouseleave ||
                                    (self.__options.triggerClose.touchleave && env.hasTouchCapability)
                                ) {

                                    // we use an event to allow users/plugins to control when the mouseleave/touchleave
                                    // close triggers will come to action. It allows to have more triggering elements
                                    // than just the origin and the tooltip for example, or to cancel/delay the closing,
                                    // or to make the tooltip interactive even if it wasn't when it was open, etc.
                                    self._on('dismissable', function(event) {

                                        if (event.dismissable) {

                                            if (event.delay) {

                                                timeout = setTimeout(function() {
                                                    // event.event may be undefined
                                                    self._close(event.event);
                                                }, event.delay);

                                                self.__timeouts.close.push(timeout);
                                            } else {
                                                self._close(event);
                                            }
                                        } else {
                                            clearTimeout(timeout);
                                        }
                                    });

                                    // now set the listeners that will trigger 'dismissable' events
                                    var $elements = self._$origin,
                                        eventNamesIn = '',
                                        eventNamesOut = '',
                                        timeout = null;

                                    // if we have to allow interaction, bind on the tooltip too
                                    if (self.__options.interactive) {
                                        $elements = $elements.add(self._$tooltip);
                                    }

                                    if (self.__options.triggerClose.mouseleave) {
                                        eventNamesIn += 'mouseenter.' + self.__namespace + '-triggerClose ';
                                        eventNamesOut += 'mouseleave.' + self.__namespace + '-triggerClose ';
                                    }
                                    if (self.__options.triggerClose.touchleave && env.hasTouchCapability) {
                                        eventNamesIn += 'touchstart.' + self.__namespace + '-triggerClose';
                                        eventNamesOut += 'touchend.' + self.__namespace + '-triggerClose touchcancel.' + self.__namespace + '-triggerClose';
                                    }

                                    $elements
                                    // close after some time spent outside of the elements
                                        .on(eventNamesOut, function(event) {

                                            // it's ok if the touch gesture ended up to be a swipe,
                                            // it's still a "touch leave" situation
                                            if (self._touchIsTouchEvent(event) ||
                                                !self._touchIsEmulatedEvent(event)
                                            ) {

                                                var delay = (event.type == 'mouseleave') ?
                                                    self.__options.delay :
                                                    self.__options.delayTouch;

                                                self._trigger({
                                                    delay: delay[1],
                                                    dismissable: true,
                                                    event: event,
                                                    type: 'dismissable'
                                                });
                                            }
                                        })
                                        // suspend the mouseleave timeout when the pointer comes back
                                        // over the elements
                                        .on(eventNamesIn, function(event) {

                                            // it's also ok if the touch event is a swipe gesture
                                            if (self._touchIsTouchEvent(event) ||
                                                !self._touchIsEmulatedEvent(event)
                                            ) {
                                                self._trigger({
                                                    dismissable: false,
                                                    event: event,
                                                    type: 'dismissable'
                                                });
                                            }
                                        });
                                }

                                // close the tooltip when the origin gets a mouse click (common behavior of
                                // native tooltips)
                                if (self.__options.triggerClose.originClick) {

                                    self._$origin.on('click.' + self.__namespace + '-triggerClose', function(event) {

                                        // we could actually let a tap trigger this but this feature just
                                        // does not make sense on touch devices
                                        if (!self._touchIsTouchEvent(event) &&
                                            !self._touchIsEmulatedEvent(event)
                                        ) {
                                            self._close(event);
                                        }
                                    });
                                }

                                // set the same bindings for click and touch on the body to close the tooltip
                                if (self.__options.triggerClose.click ||
                                    (self.__options.triggerClose.tap && env.hasTouchCapability)
                                ) {

                                    // don't set right away since the click/tap event which triggered this method
                                    // (if it was a click/tap) is going to bubble up to the body, we don't want it
                                    // to close the tooltip immediately after it opened
                                    setTimeout(function() {

                                        if (self.__state != 'closed') {

                                            var eventNames = '',
                                                $body = $(env.window.document.body);

                                            if (self.__options.triggerClose.click) {
                                                eventNames += 'click.' + self.__namespace + '-triggerClose ';
                                            }
                                            if (self.__options.triggerClose.tap && env.hasTouchCapability) {
                                                eventNames += 'touchend.' + self.__namespace + '-triggerClose';
                                            }

                                            $body.on(eventNames, function(event) {

                                                if (self._touchIsMeaningfulEvent(event)) {

                                                    self._touchRecordEvent(event);

                                                    if (!self.__options.interactive || !$.contains(self._$tooltip[0], event.target)) {
                                                        self._close(event);
                                                    }
                                                }
                                            });

                                            // needed to detect and ignore swiping
                                            if (self.__options.triggerClose.tap && env.hasTouchCapability) {

                                                $body.on('touchstart.' + self.__namespace + '-triggerClose', function(event) {
                                                    self._touchRecordEvent(event);
                                                });
                                            }
                                        }
                                    }, 0);
                                }

                                self._trigger('ready');

                                // call our custom callback
                                if (self.__options.functionReady) {
                                    self.__options.functionReady.call(self, self, {
                                        origin: self._$origin[0],
                                        tooltip: self._$tooltip[0]
                                    });
                                }
                            }

                            // if we have a timer set, let the countdown begin
                            if (self.__options.timer > 0) {

                                var timeout = setTimeout(function() {
                                    self._close();
                                }, self.__options.timer + extraTime);

                                self.__timeouts.close.push(timeout);
                            }
                        }
                    }
                }
            }

            return self;
        },

        /**
         * When using the mouseenter/touchstart open triggers, this function will
         * schedule the opening of the tooltip after the delay, if there is one
         *
         * @param event
         * @returns {self}
         * @protected
         */
        _openShortly: function(event) {

            var self = this,
                ok = true;

            if (self.__state != 'stable' && self.__state != 'appearing') {

                // if a timeout is not already running
                if (!self.__timeouts.open) {

                    self._trigger({
                        type: 'start',
                        event: event,
                        stop: function() {
                            ok = false;
                        }
                    });

                    if (ok) {

                        var delay = (event.type.indexOf('touch') == 0) ?
                            self.__options.delayTouch :
                            self.__options.delay;

                        if (delay[0]) {

                            self.__timeouts.open = setTimeout(function() {

                                self.__timeouts.open = null;

                                // open only if the pointer (mouse or touch) is still over the origin.
                                // The check on the "meaningful event" can only be made here, after some
                                // time has passed (to know if the touch was a swipe or not)
                                if (self.__pointerIsOverOrigin && self._touchIsMeaningfulEvent(event)) {

                                    // signal that we go on
                                    self._trigger('startend');

                                    self._open(event);
                                } else {
                                    // signal that we cancel
                                    self._trigger('startcancel');
                                }
                            }, delay[0]);
                        } else {
                            // signal that we go on
                            self._trigger('startend');

                            self._open(event);
                        }
                    }
                }
            }

            return self;
        },

        /**
         * Meant for plugins to get their options
         * 
         * @param {string} pluginName The name of the plugin that asks for its options
         * @param {object} defaultOptions The default options of the plugin
         * @returns {object} The options
         * @protected
         */
        _optionsExtract: function(pluginName, defaultOptions) {

            var self = this,
                options = $.extend(true, {}, defaultOptions);

            // if the plugin options were isolated in a property named after the
            // plugin, use them (prevents conflicts with other plugins)
            var pluginOptions = self.__options[pluginName];

            // if not, try to get them as regular options
            if (!pluginOptions) {

                pluginOptions = {};

                $.each(defaultOptions, function(optionName, value) {

                    var o = self.__options[optionName];

                    if (o !== undefined) {
                        pluginOptions[optionName] = o;
                    }
                });
            }

            // let's merge the default options and the ones that were provided. We'd want
            // to do a deep copy but not let jQuery merge arrays, so we'll do a shallow
            // extend on two levels, that will be enough if options are not more than 1
            // level deep
            $.each(options, function(optionName, value) {

                if (pluginOptions[optionName] !== undefined) {

                    if ((typeof value == 'object' &&
                            !(value instanceof Array) &&
                            value != null
                        ) &&
                        (typeof pluginOptions[optionName] == 'object' &&
                            !(pluginOptions[optionName] instanceof Array) &&
                            pluginOptions[optionName] != null
                        )
                    ) {
                        $.extend(options[optionName], pluginOptions[optionName]);
                    } else {
                        options[optionName] = pluginOptions[optionName];
                    }
                }
            });

            return options;
        },

        /**
         * Used at instantiation of the plugin, or afterwards by plugins that activate themselves
         * on existing instances
         * 
         * @param {object} pluginName
         * @returns {self}
         * @protected
         */
        _plug: function(pluginName) {

            var plugin = $.tooltipster._plugin(pluginName);

            if (plugin) {

                // if there is a constructor for instances
                if (plugin.instance) {

                    // proxy non-private methods on the instance to allow new instance methods
                    $.tooltipster.__bridge(plugin.instance, this, plugin.name);
                }
            } else {
                throw new Error('The "' + pluginName + '" plugin is not defined');
            }

            return this;
        },

        /**
         * This will return true if the event is a mouse event which was
         * emulated by the browser after a touch event. This allows us to
         * really dissociate mouse and touch triggers.
         * 
         * There is a margin of error if a real mouse event is fired right
         * after (within the delay shown below) a touch event on the same
         * element, but hopefully it should not happen often.
         * 
         * @returns {boolean}
         * @protected
         */
        _touchIsEmulatedEvent: function(event) {

            var isEmulated = false,
                now = new Date().getTime();

            for (var i = this.__touchEvents.length - 1; i >= 0; i--) {

                var e = this.__touchEvents[i];

                // delay, in milliseconds. It's supposed to be 300ms in
                // most browsers (350ms on iOS) to allow a double tap but
                // can be less (check out FastClick for more info)
                if (now - e.time < 500) {

                    if (e.target === event.target) {
                        isEmulated = true;
                    }
                } else {
                    break;
                }
            }

            return isEmulated;
        },

        /**
         * Returns false if the event was an emulated mouse event or
         * a touch event involved in a swipe gesture.
         * 
         * @param {object} event
         * @returns {boolean}
         * @protected
         */
        _touchIsMeaningfulEvent: function(event) {
            return (
                (this._touchIsTouchEvent(event) && !this._touchSwiped(event.target)) ||
                (!this._touchIsTouchEvent(event) && !this._touchIsEmulatedEvent(event))
            );
        },

        /**
         * Checks if an event is a touch event
         * 
         * @param {object} event
         * @returns {boolean}
         * @protected
         */
        _touchIsTouchEvent: function(event) {
            return event.type.indexOf('touch') == 0;
        },

        /**
         * Store touch events for a while to detect swiping and emulated mouse events
         * 
         * @param {object} event
         * @returns {self}
         * @protected
         */
        _touchRecordEvent: function(event) {

            if (this._touchIsTouchEvent(event)) {
                event.time = new Date().getTime();
                this.__touchEvents.push(event);
            }

            return this;
        },

        /**
         * Returns true if a swipe happened after the last touchstart event fired on
         * event.target.
         * 
         * We need to differentiate a swipe from a tap before we let the event open
         * or close the tooltip. A swipe is when a touchmove (scroll) event happens
         * on the body between the touchstart and the touchend events of an element.
         * 
         * @param {object} target The HTML element that may have triggered the swipe
         * @returns {boolean}
         * @protected
         */
        _touchSwiped: function(target) {

            var swiped = false;

            for (var i = this.__touchEvents.length - 1; i >= 0; i--) {

                var e = this.__touchEvents[i];

                if (e.type == 'touchmove') {
                    swiped = true;
                    break;
                } else if (
                    e.type == 'touchstart' &&
                    target === e.target
                ) {
                    break;
                }
            }

            return swiped;
        },

        /**
         * Triggers an event on the instance emitters
         * 
         * @returns {self}
         * @protected
         */
        _trigger: function() {

            var args = Array.prototype.slice.apply(arguments);

            if (typeof args[0] == 'string') {
                args[0] = { type: args[0] };
            }

            // add properties to the event
            args[0].instance = this;
            args[0].origin = this._$origin ? this._$origin[0] : null;
            args[0].tooltip = this._$tooltip ? this._$tooltip[0] : null;

            // note: the order of emitters matters
            this.__$emitterPrivate.trigger.apply(this.__$emitterPrivate, args);
            $.tooltipster._trigger.apply($.tooltipster, args);
            this.__$emitterPublic.trigger.apply(this.__$emitterPublic, args);

            return this;
        },

        /**
         * Deactivate a plugin on this instance
         * 
         * @returns {self}
         * @protected
         */
        _unplug: function(pluginName) {

            var self = this;

            // if the plugin has been activated on this instance
            if (self[pluginName]) {

                var plugin = $.tooltipster._plugin(pluginName);

                // if there is a constructor for instances
                if (plugin.instance) {

                    // unbridge
                    $.each(plugin.instance, function(methodName, fn) {

                        // if the method exists (privates methods do not) and comes indeed from
                        // this plugin (may be missing or come from a conflicting plugin).
                        if (self[methodName] &&
                            self[methodName].bridged === self[pluginName]
                        ) {
                            delete self[methodName];
                        }
                    });
                }

                // destroy the plugin
                if (self[pluginName].__destroy) {
                    self[pluginName].__destroy();
                }

                // remove the reference to the plugin instance
                delete self[pluginName];
            }

            return self;
        },

        /**
         * @see self::_close
         * @returns {self}
         * @public
         */
        close: function(callback) {

            if (!this.__destroyed) {
                this._close(null, callback);
            } else {
                this.__destroyError();
            }

            return this;
        },

        /**
         * Sets or gets the content of the tooltip
         * 
         * @returns {mixed|self}
         * @public
         */
        content: function(content) {

            var self = this;

            // getter method
            if (content === undefined) {
                return self.__Content;
            }
            // setter method
            else {

                if (!self.__destroyed) {

                    // change the content
                    self.__contentSet(content);

                    if (self.__Content !== null) {

                        // update the tooltip if it is open
                        if (self.__state !== 'closed') {

                            // reset the content in the tooltip
                            self.__contentInsert();

                            // reposition and resize the tooltip
                            self.reposition();

                            // if we want to play a little animation showing the content changed
                            if (self.__options.updateAnimation) {

                                if (env.hasTransitions) {

                                    // keep the reference in the local scope
                                    var animation = self.__options.updateAnimation;

                                    self._$tooltip.addClass('tooltipster-update-' + animation);

                                    // remove the class after a while. The actual duration of the
                                    // update animation may be shorter, it's set in the CSS rules
                                    setTimeout(function() {

                                        if (self.__state != 'closed') {

                                            self._$tooltip.removeClass('tooltipster-update-' + animation);
                                        }
                                    }, 1000);
                                } else {
                                    self._$tooltip.fadeTo(200, 0.5, function() {
                                        if (self.__state != 'closed') {
                                            self._$tooltip.fadeTo(200, 1);
                                        }
                                    });
                                }
                            }
                        }
                    } else {
                        self._close();
                    }
                } else {
                    self.__destroyError();
                }

                return self;
            }
        },

        /**
         * Destroys the tooltip
         * 
         * @returns {self}
         * @public
         */
        destroy: function() {

            var self = this;

            if (!self.__destroyed) {

                if (self.__state != 'closed') {

                    // no closing delay
                    self.option('animationDuration', 0)
                        // force closing
                        ._close(null, null, true);
                } else {
                    // there might be an open timeout still running
                    self.__timeoutsClear();
                }

                // send event
                self._trigger('destroy');

                self.__destroyed = true;

                self._$origin
                    .removeData(self.__namespace)
                    // remove the open trigger listeners
                    .off('.' + self.__namespace + '-triggerOpen');

                // remove the touch listener
                $(env.window.document.body).off('.' + self.__namespace + '-triggerOpen');

                var ns = self._$origin.data('tooltipster-ns');

                // if the origin has been removed from DOM, its data may
                // well have been destroyed in the process and there would
                // be nothing to clean up or restore
                if (ns) {

                    // if there are no more tooltips on this element
                    if (ns.length === 1) {

                        // optional restoration of a title attribute
                        var title = null;
                        if (self.__options.restoration == 'previous') {
                            title = self._$origin.data('tooltipster-initialTitle');
                        } else if (self.__options.restoration == 'current') {

                            // old school technique to stringify when outerHTML is not supported
                            title = (typeof self.__Content == 'string') ?
                                self.__Content :
                                $('<div></div>').append(self.__Content).html();
                        }

                        if (title) {
                            self._$origin.attr('title', title);
                        }

                        // final cleaning

                        self._$origin.removeClass('tooltipstered');

                        self._$origin
                            .removeData('tooltipster-ns')
                            .removeData('tooltipster-initialTitle');
                    } else {
                        // remove the instance namespace from the list of namespaces of
                        // tooltips present on the element
                        ns = $.grep(ns, function(el, i) {
                            return el !== self.__namespace;
                        });
                        self._$origin.data('tooltipster-ns', ns);
                    }
                }

                // last event
                self._trigger('destroyed');

                // unbind private and public event listeners
                self._off();
                self.off();

                // remove external references, just in case
                self.__Content = null;
                self.__$emitterPrivate = null;
                self.__$emitterPublic = null;
                self.__options.parent = null;
                self._$origin = null;
                self._$tooltip = null;

                // make sure the object is no longer referenced in there to prevent
                // memory leaks
                $.tooltipster.__instancesLatestArr = $.grep($.tooltipster.__instancesLatestArr, function(el, i) {
                    return self !== el;
                });

                clearInterval(self.__garbageCollector);
            } else {
                self.__destroyError();
            }

            // we return the scope rather than true so that the call to
            // .tooltipster('destroy') actually returns the matched elements
            // and applies to all of them
            return self;
        },

        /**
         * Disables the tooltip
         * 
         * @returns {self}
         * @public
         */
        disable: function() {

            if (!this.__destroyed) {

                // close first, in case the tooltip would not disappear on
                // its own (no close trigger)
                this._close();
                this.__enabled = false;

                return this;
            } else {
                this.__destroyError();
            }

            return this;
        },

        /**
         * Returns the HTML element of the origin
         *
         * @returns {self}
         * @public
         */
        elementOrigin: function() {

            if (!this.__destroyed) {
                return this._$origin[0];
            } else {
                this.__destroyError();
            }
        },

        /**
         * Returns the HTML element of the tooltip
         *
         * @returns {self}
         * @public
         */
        elementTooltip: function() {
            return this._$tooltip ? this._$tooltip[0] : null;
        },

        /**
         * Enables the tooltip
         * 
         * @returns {self}
         * @public
         */
        enable: function() {
            this.__enabled = true;
            return this;
        },

        /**
         * Alias, deprecated in 4.0.0
         * 
         * @param {function} callback
         * @returns {self}
         * @public
         */
        hide: function(callback) {
            return this.close(callback);
        },

        /**
         * Returns the instance
         * 
         * @returns {self}
         * @public
         */
        instance: function() {
            return this;
        },

        /**
         * For public use only, not to be used by plugins (use ::_off() instead)
         * 
         * @returns {self}
         * @public
         */
        off: function() {

            if (!this.__destroyed) {
                this.__$emitterPublic.off.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            }

            return this;
        },

        /**
         * For public use only, not to be used by plugins (use ::_on() instead)
         *
         * @returns {self}
         * @public
         */
        on: function() {

            if (!this.__destroyed) {
                this.__$emitterPublic.on.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            } else {
                this.__destroyError();
            }

            return this;
        },

        /**
         * For public use only, not to be used by plugins
         *
         * @returns {self}
         * @public
         */
        one: function() {

            if (!this.__destroyed) {
                this.__$emitterPublic.one.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            } else {
                this.__destroyError();
            }

            return this;
        },

        /**
         * @see self::_open
         * @returns {self}
         * @public
         */
        open: function(callback) {

            if (!this.__destroyed) {
                this._open(null, callback);
            } else {
                this.__destroyError();
            }

            return this;
        },

        /**
         * Get or set options. For internal use and advanced users only.
         * 
         * @param {string} o Option name
         * @param {mixed} val optional A new value for the option
         * @return {mixed|self} If val is omitted, the value of the option
         * is returned, otherwise the instance itself is returned
         * @public
         */
        option: function(o, val) {

            // getter
            if (val === undefined) {
                return this.__options[o];
            }
            // setter
            else {

                if (!this.__destroyed) {

                    // change value
                    this.__options[o] = val;

                    // format
                    this.__optionsFormat();

                    // re-prepare the triggers if needed
                    if ($.inArray(o, ['trigger', 'triggerClose', 'triggerOpen']) >= 0) {
                        this.__prepareOrigin();
                    }

                    if (o === 'selfDestruction') {
                        this.__prepareGC();
                    }
                } else {
                    this.__destroyError();
                }

                return this;
            }
        },

        /**
         * This method is in charge of setting the position and size properties of the tooltip.
         * All the hard work is delegated to the display plugin.
         * Note: The tooltip may be detached from the DOM at the moment the method is called 
         * but must be attached by the end of the method call.
         * 
         * @param {object} event For internal use only. Defined if an event such as
         * window resizing triggered the repositioning
         * @param {boolean} tooltipIsDetached For internal use only. Set this to true if you
         * know that the tooltip not being in the DOM is not an issue (typically when the
         * tooltip element has just been created but has not been added to the DOM yet).
         * @returns {self}
         * @public
         */
        reposition: function(event, tooltipIsDetached) {

            var self = this;

            if (!self.__destroyed) {

                // if the tooltip is still open and the origin is still in the DOM
                if (self.__state != 'closed' && bodyContains(self._$origin)) {

                    // if the tooltip has not been removed from DOM manually (or if it
                    // has been detached on purpose)
                    if (tooltipIsDetached || bodyContains(self._$tooltip)) {

                        if (!tooltipIsDetached) {
                            // detach in case the tooltip overflows the window and adds
                            // scrollbars to it, so __geometry can be accurate
                            self._$tooltip.detach();
                        }

                        // refresh the geometry object before passing it as a helper
                        self.__Geometry = self.__geometry();

                        // let a plugin fo the rest
                        self._trigger({
                            type: 'reposition',
                            event: event,
                            helper: {
                                geo: self.__Geometry
                            }
                        });
                    }
                }
            } else {
                self.__destroyError();
            }

            return self;
        },

        /**
         * Alias, deprecated in 4.0.0
         *
         * @param callback
         * @returns {self}
         * @public
         */
        show: function(callback) {
            return this.open(callback);
        },

        /**
         * Returns some properties about the instance
         * 
         * @returns {object}
         * @public
         */
        status: function() {

            return {
                destroyed: this.__destroyed,
                enabled: this.__enabled,
                open: this.__state !== 'closed',
                state: this.__state
            };
        },

        /**
         * For public use only, not to be used by plugins
         *
         * @returns {self}
         * @public
         */
        triggerHandler: function() {

            if (!this.__destroyed) {
                this.__$emitterPublic.triggerHandler.apply(this.__$emitterPublic, Array.prototype.slice.apply(arguments));
            } else {
                this.__destroyError();
            }

            return this;
        }
    };

    $.fn.tooltipster = function() {

        // for using in closures
        var args = Array.prototype.slice.apply(arguments),
            // common mistake: an HTML element can't be in several tooltips at the same time
            contentCloningWarning = 'You are using a single HTML element as content for several tooltips. You probably want to set the contentCloning option to TRUE.';

        // this happens with $(sel).tooltipster(...) when $(sel) does not match anything
        if (this.length === 0) {

            // still chainable
            return this;
        }
        // this happens when calling $(sel).tooltipster('methodName or options')
        // where $(sel) matches one or more elements
        else {

            // method calls
            if (typeof args[0] === 'string') {

                var v = '#*$~&';

                this.each(function() {

                    // retrieve the namepaces of the tooltip(s) that exist on that element.
                    // We will interact with the first tooltip only.
                    var ns = $(this).data('tooltipster-ns'),
                        // self represents the instance of the first tooltipster plugin
                        // associated to the current HTML object of the loop
                        self = ns ? $(this).data(ns[0]) : null;

                    // if the current element holds a tooltipster instance
                    if (self) {

                        if (typeof self[args[0]] === 'function') {

                            if (this.length > 1 &&
                                args[0] == 'content' &&
                                (args[1] instanceof $ ||
                                    (typeof args[1] == 'object' && args[1] != null && args[1].tagName)
                                ) &&
                                !self.__options.contentCloning &&
                                self.__options.debug
                            ) {
                                console.log(contentCloningWarning);
                            }

                            // note : args[1] and args[2] may not be defined
                            var resp = self[args[0]](args[1], args[2]);
                        } else {
                            throw new Error('Unknown method "' + args[0] + '"');
                        }

                        // if the function returned anything other than the instance
                        // itself (which implies chaining, except for the `instance` method)
                        if (resp !== self || args[0] === 'instance') {

                            v = resp;

                            // return false to stop .each iteration on the first element
                            // matched by the selector
                            return false;
                        }
                    } else {
                        throw new Error('You called Tooltipster\'s "' + args[0] + '" method on an uninitialized element');
                    }
                });

                return (v !== '#*$~&') ? v : this;
            }
            // first argument is undefined or an object: the tooltip is initializing
            else {

                // reset the array of last initialized objects
                $.tooltipster.__instancesLatestArr = [];

                // is there a defined value for the multiple option in the options object ?
                var multipleIsSet = args[0] && args[0].multiple !== undefined,
                    // if the multiple option is set to true, or if it's not defined but
                    // set to true in the defaults
                    multiple = (multipleIsSet && args[0].multiple) || (!multipleIsSet && defaults.multiple),
                    // same for content
                    contentIsSet = args[0] && args[0].content !== undefined,
                    content = (contentIsSet && args[0].content) || (!contentIsSet && defaults.content),
                    // same for contentCloning
                    contentCloningIsSet = args[0] && args[0].contentCloning !== undefined,
                    contentCloning =
                    (contentCloningIsSet && args[0].contentCloning) ||
                    (!contentCloningIsSet && defaults.contentCloning),
                    // same for debug
                    debugIsSet = args[0] && args[0].debug !== undefined,
                    debug = (debugIsSet && args[0].debug) || (!debugIsSet && defaults.debug);

                if (this.length > 1 &&
                    (content instanceof $ ||
                        (typeof content == 'object' && content != null && content.tagName)
                    ) &&
                    !contentCloning &&
                    debug
                ) {
                    console.log(contentCloningWarning);
                }

                // create a tooltipster instance for each element if it doesn't
                // already have one or if the multiple option is set, and attach the
                // object to it
                this.each(function() {

                    var go = false,
                        $this = $(this),
                        ns = $this.data('tooltipster-ns'),
                        obj = null;

                    if (!ns) {
                        go = true;
                    } else if (multiple) {
                        go = true;
                    } else if (debug) {
                        console.log('Tooltipster: one or more tooltips are already attached to the element below. Ignoring.');
                        console.log(this);
                    }

                    if (go) {
                        obj = new $.Tooltipster(this, args[0]);

                        // save the reference of the new instance
                        if (!ns) ns = [];
                        ns.push(obj.__namespace);
                        $this.data('tooltipster-ns', ns);

                        // save the instance itself
                        $this.data(obj.__namespace, obj);

                        // call our constructor custom function.
                        // we do this here and not in ::init() because we wanted
                        // the object to be saved in $this.data before triggering
                        // it
                        if (obj.__options.functionInit) {
                            obj.__options.functionInit.call(obj, obj, {
                                origin: this
                            });
                        }

                        // and now the event, for the plugins and core emitter
                        obj._trigger('init');
                    }

                    $.tooltipster.__instancesLatestArr.push(obj);
                });

                return this;
            }
        }
    };

    // Utilities

    /**
     * A class to check if a tooltip can fit in given dimensions
     * 
     * @param {object} $tooltip The jQuery wrapped tooltip element, or a clone of it
     */
    function Ruler($tooltip) {

        // list of instance variables

        this.$container;
        this.constraints = null;
        this.__$tooltip;

        this.__init($tooltip);
    }

    Ruler.prototype = {

        /**
         * Move the tooltip into an invisible div that does not allow overflow to make
         * size tests. Note: the tooltip may or may not be attached to the DOM at the
         * moment this method is called, it does not matter.
         * 
         * @param {object} $tooltip The object to test. May be just a clone of the
         * actual tooltip.
         * @private
         */
        __init: function($tooltip) {

            this.__$tooltip = $tooltip;

            this.__$tooltip
                .css({
                    // for some reason we have to specify top and left 0
                    left: 0,
                    // any overflow will be ignored while measuring
                    overflow: 'hidden',
                    // positions at (0,0) without the div using 100% of the available width
                    position: 'absolute',
                    top: 0
                })
                // overflow must be auto during the test. We re-set this in case
                // it were modified by the user
                .find('.tooltipster-content')
                .css('overflow', 'auto');

            this.$container = $('<div class="tooltipster-ruler"></div>')
                .append(this.__$tooltip)
                .appendTo(env.window.document.body);
        },

        /**
         * Force the browser to redraw (re-render) the tooltip immediately. This is required
         * when you changed some CSS properties and need to make something with it
         * immediately, without waiting for the browser to redraw at the end of instructions.
         *
         * @see http://stackoverflow.com/questions/3485365/how-can-i-force-webkit-to-redraw-repaint-to-propagate-style-changes
         * @private
         */
        __forceRedraw: function() {

            // note: this would work but for Webkit only
            //this.__$tooltip.close();
            //this.__$tooltip[0].offsetHeight;
            //this.__$tooltip.open();

            // works in FF too
            var $p = this.__$tooltip.parent();
            this.__$tooltip.detach();
            this.__$tooltip.appendTo($p);
        },

        /**
         * Set maximum dimensions for the tooltip. A call to ::measure afterwards
         * will tell us if the content overflows or if it's ok
         *
         * @param {int} width
         * @param {int} height
         * @return {Ruler}
         * @public
         */
        constrain: function(width, height) {

            this.constraints = {
                width: width,
                height: height
            };

            this.__$tooltip.css({
                // we disable display:flex, otherwise the content would overflow without
                // creating horizontal scrolling (which we need to detect).
                display: 'block',
                // reset any previous height
                height: '',
                // we'll check if horizontal scrolling occurs
                overflow: 'auto',
                // we'll set the width and see what height is generated and if there
                // is horizontal overflow
                width: width
            });

            return this;
        },

        /**
         * Reset the tooltip content overflow and remove the test container
         * 
         * @returns {Ruler}
         * @public
         */
        destroy: function() {

            // in case the element was not a clone
            this.__$tooltip
                .detach()
                .find('.tooltipster-content')
                .css({
                    // reset to CSS value
                    display: '',
                    overflow: ''
                });

            this.$container.remove();
        },

        /**
         * Removes any constraints
         * 
         * @returns {Ruler}
         * @public
         */
        free: function() {

            this.constraints = null;

            // reset to natural size
            this.__$tooltip.css({
                display: '',
                height: '',
                overflow: 'visible',
                width: ''
            });

            return this;
        },

        /**
         * Returns the size of the tooltip. When constraints are applied, also returns
         * whether the tooltip fits in the provided dimensions.
         * The idea is to see if the new height is small enough and if the content does
         * not overflow horizontally.
         *
         * @param {int} width
         * @param {int} height
         * @returns {object} An object with a bool `fits` property and a `size` property
         * @public
         */
        measure: function() {

            this.__forceRedraw();

            var tooltipBcr = this.__$tooltip[0].getBoundingClientRect(),
                result = {
                    size: {
                        // bcr.width/height are not defined in IE8- but in this
                        // case, bcr.right/bottom will have the same value
                        // except in iOS 8+ where tooltipBcr.bottom/right are wrong
                        // after scrolling for reasons yet to be determined.
                        // tooltipBcr.top/left might not be 0, see issue #514
                        height: tooltipBcr.height || (tooltipBcr.bottom - tooltipBcr.top),
                        width: tooltipBcr.width || (tooltipBcr.right - tooltipBcr.left)
                    }
                };

            if (this.constraints) {

                // note: we used to use offsetWidth instead of boundingRectClient but
                // it returned rounded values, causing issues with sub-pixel layouts.

                // note2: noticed that the bcrWidth of text content of a div was once
                // greater than the bcrWidth of its container by 1px, causing the final
                // tooltip box to be too small for its content. However, evaluating
                // their widths one against the other (below) surprisingly returned
                // equality. Happened only once in Chrome 48, was not able to reproduce
                // => just having fun with float position values...

                var $content = this.__$tooltip.find('.tooltipster-content'),
                    height = this.__$tooltip.outerHeight(),
                    contentBcr = $content[0].getBoundingClientRect(),
                    fits = {
                        height: height <= this.constraints.height,
                        width: (
                            // this condition accounts for min-width property that
                            // may apply
                            tooltipBcr.width <= this.constraints.width
                            // the -1 is here because scrollWidth actually returns
                            // a rounded value, and may be greater than bcr.width if
                            // it was rounded up. This may cause an issue for contents
                            // which actually really overflow  by 1px or so, but that
                            // should be rare. Not sure how to solve this efficiently.
                            // See http://blogs.msdn.com/b/ie/archive/2012/02/17/sub-pixel-rendering-and-the-css-object-model.aspx
                            &&
                            contentBcr.width >= $content[0].scrollWidth - 1
                        )
                    };

                result.fits = fits.height && fits.width;
            }

            // old versions of IE get the width wrong for some reason and it causes
            // the text to be broken to a new line, so we round it up. If the width
            // is the width of the screen though, we can assume it is accurate.
            if (env.IE &&
                env.IE <= 11 &&
                result.size.width !== env.window.document.documentElement.clientWidth
            ) {
                result.size.width = Math.ceil(result.size.width) + 1;
            }

            return result;
        }
    };

    // quick & dirty compare function, not bijective nor multidimensional
    function areEqual(a, b) {
        var same = true;
        $.each(a, function(i, _) {
            if (b[i] === undefined || a[i] !== b[i]) {
                same = false;
                return false;
            }
        });
        return same;
    }

    /**
     * A fast function to check if an element is still in the DOM. It
     * tries to use an id as ids are indexed by the browser, or falls
     * back to jQuery's `contains` method. May fail if two elements
     * have the same id, but so be it
     *
     * @param {object} $obj A jQuery-wrapped HTML element
     * @return {boolean}
     */
    function bodyContains($obj) {
        var id = $obj.attr('id'),
            el = id ? env.window.document.getElementById(id) : null;
        // must also check that the element with the id is the one we want
        return el ? el === $obj[0] : $.contains(env.window.document.body, $obj[0]);
    }

    // detect IE versions for dirty fixes
    var uA = navigator.userAgent.toLowerCase();
    if (uA.indexOf('msie') != -1) env.IE = parseInt(uA.split('msie')[1]);
    else if (uA.toLowerCase().indexOf('trident') !== -1 && uA.indexOf(' rv:11') !== -1) env.IE = 11;
    else if (uA.toLowerCase().indexOf('edge/') != -1) env.IE = parseInt(uA.toLowerCase().split('edge/')[1]);

    // detecting support for CSS transitions
    function transitionSupport() {

        // env.window is not defined yet when this is called
        if (!win) return false;

        var b = win.document.body || win.document.documentElement,
            s = b.style,
            p = 'transition',
            v = ['Moz', 'Webkit', 'Khtml', 'O', 'ms'];

        if (typeof s[p] == 'string') { return true; }

        p = p.charAt(0).toUpperCase() + p.substr(1);
        for (var i = 0; i < v.length; i++) {
            if (typeof s[v[i] + p] == 'string') { return true; }
        }
        return false;
    }

    // we'll return jQuery for plugins not to have to declare it as a dependency,
    // but it's done by a build task since it should be included only once at the
    // end when we concatenate the main file with a plugin
    // sideTip is Tooltipster's default plugin.
    // This file will be UMDified by a build task.

    var pluginName = 'tooltipster.sideTip';

    $.tooltipster._plugin({
        name: pluginName,
        instance: {
            /**
             * Defaults are provided as a function for an easy override by inheritance
             *
             * @return {object} An object with the defaults options
             * @private
             */
            __defaults: function() {

                return {
                    // if the tooltip should display an arrow that points to the origin
                    arrow: true,
                    // the distance in pixels between the tooltip and the origin
                    distance: 6,
                    // allows to easily change the position of the tooltip
                    functionPosition: null,
                    maxWidth: null,
                    // used to accomodate the arrow of tooltip if there is one.
                    // First to make sure that the arrow target is not too close
                    // to the edge of the tooltip, so the arrow does not overflow
                    // the tooltip. Secondly when we reposition the tooltip to
                    // make sure that it's positioned in such a way that the arrow is
                    // still pointing at the target (and not a few pixels beyond it).
                    // It should be equal to or greater than half the width of
                    // the arrow (by width we mean the size of the side which touches
                    // the side of the tooltip).
                    minIntersection: 16,
                    minWidth: 0,
                    // deprecated in 4.0.0. Listed for _optionsExtract to pick it up
                    position: null,
                    side: 'top',
                    // set to false to position the tooltip relatively to the document rather
                    // than the window when we open it
                    viewportAware: true
                };
            },

            /**
             * Run once: at instantiation of the plugin
             *
             * @param {object} instance The tooltipster object that instantiated this plugin
             * @private
             */
            __init: function(instance) {

                var self = this;

                // list of instance variables

                self.__instance = instance;
                self.__namespace = 'tooltipster-sideTip-' + Math.round(Math.random() * 1000000);
                self.__previousState = 'closed';
                self.__options;

                // initial formatting
                self.__optionsFormat();

                self.__instance._on('state.' + self.__namespace, function(event) {

                    if (event.state == 'closed') {
                        self.__close();
                    } else if (event.state == 'appearing' && self.__previousState == 'closed') {
                        self.__create();
                    }

                    self.__previousState = event.state;
                });

                // reformat every time the options are changed
                self.__instance._on('options.' + self.__namespace, function() {
                    self.__optionsFormat();
                });

                self.__instance._on('reposition.' + self.__namespace, function(e) {
                    self.__reposition(e.event, e.helper);
                });
            },

            /**
             * Called when the tooltip has closed
             * 
             * @private
             */
            __close: function() {

                // detach our content object first, so the next jQuery's remove()
                // call does not unbind its event handlers
                if (this.__instance.content() instanceof $) {
                    this.__instance.content().detach();
                }

                // remove the tooltip from the DOM
                this.__instance._$tooltip.remove();
                this.__instance._$tooltip = null;
            },

            /**
             * Creates the HTML element of the tooltip.
             * 
             * @private
             */
            __create: function() {

                // note: we wrap with a .tooltipster-box div to be able to set a margin on it
                // (.tooltipster-base must not have one)
                var $html = $(
                    '<div class="tooltipster-base tooltipster-sidetip">' +
                    '<div class="tooltipster-box">' +
                    '<div class="tooltipster-content"></div>' +
                    '</div>' +
                    '<div class="tooltipster-arrow">' +
                    '<div class="tooltipster-arrow-uncropped">' +
                    '<div class="tooltipster-arrow-border"></div>' +
                    '<div class="tooltipster-arrow-background"></div>' +
                    '</div>' +
                    '</div>' +
                    '</div>'
                );

                // hide arrow if asked
                if (!this.__options.arrow) {
                    $html
                        .find('.tooltipster-box')
                        .css('margin', 0)
                        .end()
                        .find('.tooltipster-arrow')
                        .hide();
                }

                // apply min/max width if asked
                if (this.__options.minWidth) {
                    $html.css('min-width', this.__options.minWidth + 'px');
                }
                if (this.__options.maxWidth) {
                    $html.css('max-width', this.__options.maxWidth + 'px');
                }

                this.__instance._$tooltip = $html;

                // tell the instance that the tooltip element has been created
                this.__instance._trigger('created');
            },

            /**
             * Used when the plugin is to be unplugged
             *
             * @private
             */
            __destroy: function() {
                this.__instance._off('.' + self.__namespace);
            },

            /**
             * (Re)compute this.__options from the options declared to the instance
             *
             * @private
             */
            __optionsFormat: function() {

                var self = this;

                // get the options
                self.__options = self.__instance._optionsExtract(pluginName, self.__defaults());

                // for backward compatibility, deprecated in v4.0.0
                if (self.__options.position) {
                    self.__options.side = self.__options.position;
                }

                // options formatting

                // format distance as a four-cell array if it ain't one yet and then make
                // it an object with top/bottom/left/right properties
                if (typeof self.__options.distance != 'object') {
                    self.__options.distance = [self.__options.distance];
                }
                if (self.__options.distance.length < 4) {

                    if (self.__options.distance[1] === undefined) self.__options.distance[1] = self.__options.distance[0];
                    if (self.__options.distance[2] === undefined) self.__options.distance[2] = self.__options.distance[0];
                    if (self.__options.distance[3] === undefined) self.__options.distance[3] = self.__options.distance[1];

                    self.__options.distance = {
                        top: self.__options.distance[0],
                        right: self.__options.distance[1],
                        bottom: self.__options.distance[2],
                        left: self.__options.distance[3]
                    };
                }

                // let's transform:
                // 'top' into ['top', 'bottom', 'right', 'left']
                // 'right' into ['right', 'left', 'top', 'bottom']
                // 'bottom' into ['bottom', 'top', 'right', 'left']
                // 'left' into ['left', 'right', 'top', 'bottom']
                if (typeof self.__options.side == 'string') {

                    var opposites = {
                        'top': 'bottom',
                        'right': 'left',
                        'bottom': 'top',
                        'left': 'right'
                    };

                    self.__options.side = [self.__options.side, opposites[self.__options.side]];

                    if (self.__options.side[0] == 'left' || self.__options.side[0] == 'right') {
                        self.__options.side.push('top', 'bottom');
                    } else {
                        self.__options.side.push('right', 'left');
                    }
                }

                // misc
                // disable the arrow in IE6 unless the arrow option was explicitly set to true
                if ($.tooltipster._env.IE === 6 &&
                    self.__options.arrow !== true
                ) {
                    self.__options.arrow = false;
                }
            },

            /**
             * This method must compute and set the positioning properties of the
             * tooltip (left, top, width, height, etc.). It must also make sure the
             * tooltip is eventually appended to its parent (since the element may be
             * detached from the DOM at the moment the method is called).
             *
             * We'll evaluate positioning scenarios to find which side can contain the
             * tooltip in the best way. We'll consider things relatively to the window
             * (unless the user asks not to), then to the document (if need be, or if the
             * user explicitly requires the tests to run on the document). For each
             * scenario, measures are taken, allowing us to know how well the tooltip
             * is going to fit. After that, a sorting function will let us know what
             * the best scenario is (we also allow the user to choose his favorite
             * scenario by using an event).
             * 
             * @param {object} helper An object that contains variables that plugin
             * creators may find useful (see below)
             * @param {object} helper.geo An object with many layout properties
             * about objects of interest (window, document, origin). This should help
             * plugin users compute the optimal position of the tooltip
             * @private
             */
            __reposition: function(event, helper) {

                var self = this,
                    finalResult,
                    // to know where to put the tooltip, we need to know on which point
                    // of the x or y axis we should center it. That coordinate is the target
                    targets = self.__targetFind(helper),
                    testResults = [];

                // make sure the tooltip is detached while we make tests on a clone
                self.__instance._$tooltip.detach();

                // we could actually provide the original element to the Ruler and
                // not a clone, but it just feels right to keep it out of the
                // machinery.
                var $clone = self.__instance._$tooltip.clone(),
                    // start position tests session
                    ruler = $.tooltipster._getRuler($clone),
                    satisfied = false,
                    animation = self.__instance.option('animation');

                // an animation class could contain properties that distort the size
                if (animation) {
                    $clone.removeClass('tooltipster-' + animation);
                }

                // start evaluating scenarios
                $.each(['window', 'document'], function(i, container) {

                    var takeTest = null;

                    // let the user decide to keep on testing or not
                    self.__instance._trigger({
                        container: container,
                        helper: helper,
                        satisfied: satisfied,
                        takeTest: function(bool) {
                            takeTest = bool;
                        },
                        results: testResults,
                        type: 'positionTest'
                    });

                    if (takeTest == true ||
                        (takeTest != false &&
                            satisfied == false
                            // skip the window scenarios if asked. If they are reintegrated by
                            // the callback of the positionTest event, they will have to be
                            // excluded using the callback of positionTested
                            &&
                            (container != 'window' || self.__options.viewportAware)
                        )
                    ) {

                        // for each allowed side
                        for (var i = 0; i < self.__options.side.length; i++) {

                            var distance = {
                                    horizontal: 0,
                                    vertical: 0
                                },
                                side = self.__options.side[i];

                            if (side == 'top' || side == 'bottom') {
                                distance.vertical = self.__options.distance[side];
                            } else {
                                distance.horizontal = self.__options.distance[side];
                            }

                            // this may have an effect on the size of the tooltip if there are css
                            // rules for the arrow or something else
                            self.__sideChange($clone, side);

                            $.each(['natural', 'constrained'], function(i, mode) {

                                takeTest = null;

                                // emit an event on the instance
                                self.__instance._trigger({
                                    container: container,
                                    event: event,
                                    helper: helper,
                                    mode: mode,
                                    results: testResults,
                                    satisfied: satisfied,
                                    side: side,
                                    takeTest: function(bool) {
                                        takeTest = bool;
                                    },
                                    type: 'positionTest'
                                });

                                if (takeTest == true ||
                                    (takeTest != false &&
                                        satisfied == false
                                    )
                                ) {

                                    var testResult = {
                                        container: container,
                                        // we let the distance as an object here, it can make things a little easier
                                        // during the user's calculations at positionTest/positionTested
                                        distance: distance,
                                        // whether the tooltip can fit in the size of the viewport (does not mean
                                        // that we'll be able to make it initially entirely visible, see 'whole')
                                        fits: null,
                                        mode: mode,
                                        outerSize: null,
                                        side: side,
                                        size: null,
                                        target: targets[side],
                                        // check if the origin has enough surface on screen for the tooltip to
                                        // aim at it without overflowing the viewport (this is due to the thickness
                                        // of the arrow represented by the minIntersection length).
                                        // If not, the tooltip will have to be partly or entirely off screen in
                                        // order to stay docked to the origin. This value will stay null when the
                                        // container is the document, as it is not relevant
                                        whole: null
                                    };

                                    // get the size of the tooltip with or without size constraints
                                    var rulerConfigured = (mode == 'natural') ?
                                        ruler.free() :
                                        ruler.constrain(
                                            helper.geo.available[container][side].width - distance.horizontal,
                                            helper.geo.available[container][side].height - distance.vertical
                                        ),
                                        rulerResults = rulerConfigured.measure();

                                    testResult.size = rulerResults.size;
                                    testResult.outerSize = {
                                        height: rulerResults.size.height + distance.vertical,
                                        width: rulerResults.size.width + distance.horizontal
                                    };

                                    if (mode == 'natural') {

                                        if (helper.geo.available[container][side].width >= testResult.outerSize.width &&
                                            helper.geo.available[container][side].height >= testResult.outerSize.height
                                        ) {
                                            testResult.fits = true;
                                        } else {
                                            testResult.fits = false;
                                        }
                                    } else {
                                        testResult.fits = rulerResults.fits;
                                    }

                                    if (container == 'window') {

                                        if (!testResult.fits) {
                                            testResult.whole = false;
                                        } else {
                                            if (side == 'top' || side == 'bottom') {

                                                testResult.whole = (
                                                    helper.geo.origin.windowOffset.right >= self.__options.minIntersection &&
                                                    helper.geo.window.size.width - helper.geo.origin.windowOffset.left >= self.__options.minIntersection
                                                );
                                            } else {
                                                testResult.whole = (
                                                    helper.geo.origin.windowOffset.bottom >= self.__options.minIntersection &&
                                                    helper.geo.window.size.height - helper.geo.origin.windowOffset.top >= self.__options.minIntersection
                                                );
                                            }
                                        }
                                    }

                                    testResults.push(testResult);

                                    // we don't need to compute more positions if we have one fully on screen
                                    if (testResult.whole) {
                                        satisfied = true;
                                    } else {
                                        // don't run the constrained test unless the natural width was greater
                                        // than the available width, otherwise it's pointless as we know it
                                        // wouldn't fit either
                                        if (testResult.mode == 'natural' &&
                                            (testResult.fits ||
                                                testResult.size.width <= helper.geo.available[container][side].width
                                            )
                                        ) {
                                            return false;
                                        }
                                    }
                                }
                            });
                        }
                    }
                });

                // the user may eliminate the unwanted scenarios from testResults, but he's
                // not supposed to alter them at this point. functionPosition and the
                // position event serve that purpose.
                self.__instance._trigger({
                    edit: function(r) {
                        testResults = r;
                    },
                    event: event,
                    helper: helper,
                    results: testResults,
                    type: 'positionTested'
                });

                /**
                 * Sort the scenarios to find the favorite one.
                 * 
                 * The favorite scenario is when we can fully display the tooltip on screen,
                 * even if it means that the middle of the tooltip is no longer centered on
                 * the middle of the origin (when the origin is near the edge of the screen
                 * or even partly off screen). We want the tooltip on the preferred side,
                 * even if it means that we have to use a constrained size rather than a
                 * natural one (as long as it fits). When the origin is off screen at the top
                 * the tooltip will be positioned at the bottom (if allowed), if the origin
                 * is off screen on the right, it will be positioned on the left, etc.
                 * If there are no scenarios where the tooltip can fit on screen, or if the
                 * user does not want the tooltip to fit on screen (viewportAware == false),
                 * we fall back to the scenarios relative to the document.
                 * 
                 * When the tooltip is bigger than the viewport in either dimension, we stop
                 * looking at the window scenarios and consider the document scenarios only,
                 * with the same logic to find on which side it would fit best.
                 * 
                 * If the tooltip cannot fit the document on any side, we force it at the
                 * bottom, so at least the user can scroll to see it.
                 */
                testResults.sort(function(a, b) {

                    // best if it's whole (the tooltip fits and adapts to the viewport)
                    if (a.whole && !b.whole) {
                        return -1;
                    } else if (!a.whole && b.whole) {
                        return 1;
                    } else if (a.whole && b.whole) {

                        var ai = self.__options.side.indexOf(a.side),
                            bi = self.__options.side.indexOf(b.side);

                        // use the user's sides fallback array
                        if (ai < bi) {
                            return -1;
                        } else if (ai > bi) {
                            return 1;
                        } else {
                            // will be used if the user forced the tests to continue
                            return a.mode == 'natural' ? -1 : 1;
                        }
                    } else {

                        // better if it fits
                        if (a.fits && !b.fits) {
                            return -1;
                        } else if (!a.fits && b.fits) {
                            return 1;
                        } else if (a.fits && b.fits) {

                            var ai = self.__options.side.indexOf(a.side),
                                bi = self.__options.side.indexOf(b.side);

                            // use the user's sides fallback array
                            if (ai < bi) {
                                return -1;
                            } else if (ai > bi) {
                                return 1;
                            } else {
                                // will be used if the user forced the tests to continue
                                return a.mode == 'natural' ? -1 : 1;
                            }
                        } else {

                            // if everything failed, this will give a preference to the case where
                            // the tooltip overflows the document at the bottom
                            if (a.container == 'document' &&
                                a.side == 'bottom' &&
                                a.mode == 'natural'
                            ) {
                                return -1;
                            } else {
                                return 1;
                            }
                        }
                    }
                });

                finalResult = testResults[0];


                // now let's find the coordinates of the tooltip relatively to the window
                finalResult.coord = {};

                switch (finalResult.side) {

                    case 'left':
                    case 'right':
                        finalResult.coord.top = Math.floor(finalResult.target - finalResult.size.height / 2);
                        break;

                    case 'bottom':
                    case 'top':
                        finalResult.coord.left = Math.floor(finalResult.target - finalResult.size.width / 2);
                        break;
                }

                switch (finalResult.side) {

                    case 'left':
                        finalResult.coord.left = helper.geo.origin.windowOffset.left - finalResult.outerSize.width;
                        break;

                    case 'right':
                        finalResult.coord.left = helper.geo.origin.windowOffset.right + finalResult.distance.horizontal;
                        break;

                    case 'top':
                        finalResult.coord.top = helper.geo.origin.windowOffset.top - finalResult.outerSize.height;
                        break;

                    case 'bottom':
                        finalResult.coord.top = helper.geo.origin.windowOffset.bottom + finalResult.distance.vertical;
                        break;
                }

                // if the tooltip can potentially be contained within the viewport dimensions
                // and that we are asked to make it fit on screen
                if (finalResult.container == 'window') {

                    // if the tooltip overflows the viewport, we'll move it accordingly (then it will
                    // not be centered on the middle of the origin anymore). We only move horizontally
                    // for top and bottom tooltips and vice versa.
                    if (finalResult.side == 'top' || finalResult.side == 'bottom') {

                        // if there is an overflow on the left
                        if (finalResult.coord.left < 0) {

                            // prevent the overflow unless the origin itself gets off screen (minus the
                            // margin needed to keep the arrow pointing at the target)
                            if (helper.geo.origin.windowOffset.right - this.__options.minIntersection >= 0) {
                                finalResult.coord.left = 0;
                            } else {
                                finalResult.coord.left = helper.geo.origin.windowOffset.right - this.__options.minIntersection - 1;
                            }
                        }
                        // or an overflow on the right
                        else if (finalResult.coord.left > helper.geo.window.size.width - finalResult.size.width) {

                            if (helper.geo.origin.windowOffset.left + this.__options.minIntersection <= helper.geo.window.size.width) {
                                finalResult.coord.left = helper.geo.window.size.width - finalResult.size.width;
                            } else {
                                finalResult.coord.left = helper.geo.origin.windowOffset.left + this.__options.minIntersection + 1 - finalResult.size.width;
                            }
                        }
                    } else {

                        // overflow at the top
                        if (finalResult.coord.top < 0) {

                            if (helper.geo.origin.windowOffset.bottom - this.__options.minIntersection >= 0) {
                                finalResult.coord.top = 0;
                            } else {
                                finalResult.coord.top = helper.geo.origin.windowOffset.bottom - this.__options.minIntersection - 1;
                            }
                        }
                        // or at the bottom
                        else if (finalResult.coord.top > helper.geo.window.size.height - finalResult.size.height) {

                            if (helper.geo.origin.windowOffset.top + this.__options.minIntersection <= helper.geo.window.size.height) {
                                finalResult.coord.top = helper.geo.window.size.height - finalResult.size.height;
                            } else {
                                finalResult.coord.top = helper.geo.origin.windowOffset.top + this.__options.minIntersection + 1 - finalResult.size.height;
                            }
                        }
                    }
                } else {

                    // there might be overflow here too but it's easier to handle. If there has
                    // to be an overflow, we'll make sure it's on the right side of the screen
                    // (because the browser will extend the document size if there is an overflow
                    // on the right, but not on the left). The sort function above has already
                    // made sure that a bottom document overflow is preferred to a top overflow,
                    // so we don't have to care about it.

                    // if there is an overflow on the right
                    if (finalResult.coord.left > helper.geo.window.size.width - finalResult.size.width) {

                        // this may actually create on overflow on the left but we'll fix it in a sec
                        finalResult.coord.left = helper.geo.window.size.width - finalResult.size.width;
                    }

                    // if there is an overflow on the left
                    if (finalResult.coord.left < 0) {

                        // don't care if it overflows the right after that, we made our best
                        finalResult.coord.left = 0;
                    }
                }


                // submit the positioning proposal to the user function which may choose to change
                // the side, size and/or the coordinates

                // first, set the rules that corresponds to the proposed side: it may change
                // the size of the tooltip, and the custom functionPosition may want to detect the
                // size of something before making a decision. So let's make things easier for the
                // implementor
                self.__sideChange($clone, finalResult.side);

                // add some variables to the helper
                helper.tooltipClone = $clone[0];
                helper.tooltipParent = self.__instance.option('parent').parent[0];
                // move informative values to the helper
                helper.mode = finalResult.mode;
                helper.whole = finalResult.whole;
                // add some variables to the helper for the functionPosition callback (these
                // will also be added to the event fired by self.__instance._trigger but that's
                // ok, we're just being consistent)
                helper.origin = self.__instance._$origin[0];
                helper.tooltip = self.__instance._$tooltip[0];

                // leave only the actionable values in there for functionPosition
                delete finalResult.container;
                delete finalResult.fits;
                delete finalResult.mode;
                delete finalResult.outerSize;
                delete finalResult.whole;

                // keep only the distance on the relevant side, for clarity
                finalResult.distance = finalResult.distance.horizontal || finalResult.distance.vertical;

                // beginners may not be comfortable with the concept of editing the object
                //  passed by reference, so we provide an edit function and pass a clone
                var finalResultClone = $.extend(true, {}, finalResult);

                // emit an event on the instance
                self.__instance._trigger({
                    edit: function(result) {
                        finalResult = result;
                    },
                    event: event,
                    helper: helper,
                    position: finalResultClone,
                    type: 'position'
                });

                if (self.__options.functionPosition) {

                    var result = self.__options.functionPosition.call(self, self.__instance, helper, finalResultClone);

                    if (result) finalResult = result;
                }

                // end the positioning tests session (the user might have had a
                // use for it during the position event, now it's over)
                ruler.destroy();

                // compute the position of the target relatively to the tooltip root
                // element so we can place the arrow and make the needed adjustments
                var arrowCoord,
                    maxVal;

                if (finalResult.side == 'top' || finalResult.side == 'bottom') {

                    arrowCoord = {
                        prop: 'left',
                        val: finalResult.target - finalResult.coord.left
                    };
                    maxVal = finalResult.size.width - this.__options.minIntersection;
                } else {

                    arrowCoord = {
                        prop: 'top',
                        val: finalResult.target - finalResult.coord.top
                    };
                    maxVal = finalResult.size.height - this.__options.minIntersection;
                }

                // cannot lie beyond the boundaries of the tooltip, minus the
                // arrow margin
                if (arrowCoord.val < this.__options.minIntersection) {
                    arrowCoord.val = this.__options.minIntersection;
                } else if (arrowCoord.val > maxVal) {
                    arrowCoord.val = maxVal;
                }

                var originParentOffset;

                // let's convert the window-relative coordinates into coordinates relative to the
                // future positioned parent that the tooltip will be appended to
                if (helper.geo.origin.fixedLineage) {

                    // same as windowOffset when the position is fixed
                    originParentOffset = helper.geo.origin.windowOffset;
                } else {

                    // this assumes that the parent of the tooltip is located at
                    // (0, 0) in the document, typically like when the parent is
                    // <body>.
                    // If we ever allow other types of parent, .tooltipster-ruler
                    // will have to be appended to the parent to inherit css style
                    // values that affect the display of the text and such.
                    originParentOffset = {
                        left: helper.geo.origin.windowOffset.left + helper.geo.window.scroll.left,
                        top: helper.geo.origin.windowOffset.top + helper.geo.window.scroll.top
                    };
                }

                finalResult.coord = {
                    left: originParentOffset.left + (finalResult.coord.left - helper.geo.origin.windowOffset.left),
                    top: originParentOffset.top + (finalResult.coord.top - helper.geo.origin.windowOffset.top)
                };

                // set position values on the original tooltip element

                self.__sideChange(self.__instance._$tooltip, finalResult.side);

                if (helper.geo.origin.fixedLineage) {
                    self.__instance._$tooltip
                        .css('position', 'fixed');
                } else {
                    // CSS default
                    self.__instance._$tooltip
                        .css('position', '');
                }

                self.__instance._$tooltip
                    .css({
                        left: finalResult.coord.left,
                        top: finalResult.coord.top,
                        // we need to set a size even if the tooltip is in its natural size
                        // because when the tooltip is positioned beyond the width of the body
                        // (which is by default the width of the window; it will happen when
                        // you scroll the window horizontally to get to the origin), its text
                        // content will otherwise break lines at each word to keep up with the
                        // body overflow strategy.
                        height: finalResult.size.height,
                        width: finalResult.size.width
                    })
                    .find('.tooltipster-arrow')
                    .css({
                        'left': '',
                        'top': ''
                    })
                    .css(arrowCoord.prop, arrowCoord.val);

                // append the tooltip HTML element to its parent
                self.__instance._$tooltip.appendTo(self.__instance.option('parent'));

                self.__instance._trigger({
                    type: 'repositioned',
                    event: event,
                    position: finalResult
                });
            },

            /**
             * Make whatever modifications are needed when the side is changed. This has
             * been made an independant method for easy inheritance in custom plugins based
             * on this default plugin.
             *
             * @param {object} $obj
             * @param {string} side
             * @private
             */
            __sideChange: function($obj, side) {

                $obj
                    .removeClass('tooltipster-bottom')
                    .removeClass('tooltipster-left')
                    .removeClass('tooltipster-right')
                    .removeClass('tooltipster-top')
                    .addClass('tooltipster-' + side);
            },

            /**
             * Returns the target that the tooltip should aim at for a given side.
             * The calculated value is a distance from the edge of the window
             * (left edge for top/bottom sides, top edge for left/right side). The
             * tooltip will be centered on that position and the arrow will be
             * positioned there (as much as possible).
             *
             * @param {object} helper
             * @return {integer}
             * @private
             */
            __targetFind: function(helper) {

                var target = {},
                    rects = this.__instance._$origin[0].getClientRects();

                // these lines fix a Chrome bug (issue #491)
                if (rects.length > 1) {
                    var opacity = this.__instance._$origin.css('opacity');
                    if (opacity == 1) {
                        this.__instance._$origin.css('opacity', 0.99);
                        rects = this.__instance._$origin[0].getClientRects();
                        this.__instance._$origin.css('opacity', 1);
                    }
                }

                // by default, the target will be the middle of the origin
                if (rects.length < 2) {

                    target.top = Math.floor(helper.geo.origin.windowOffset.left + (helper.geo.origin.size.width / 2));
                    target.bottom = target.top;

                    target.left = Math.floor(helper.geo.origin.windowOffset.top + (helper.geo.origin.size.height / 2));
                    target.right = target.left;
                }
                // if multiple client rects exist, the element may be text split
                // up into multiple lines and the middle of the origin may not be
                // best option anymore. We need to choose the best target client rect
                else {

                    // top: the first
                    var targetRect = rects[0];
                    target.top = Math.floor(targetRect.left + (targetRect.right - targetRect.left) / 2);

                    // right: the middle line, rounded down in case there is an even
                    // number of lines (looks more centered => check out the
                    // demo with 4 split lines)
                    if (rects.length > 2) {
                        targetRect = rects[Math.ceil(rects.length / 2) - 1];
                    } else {
                        targetRect = rects[0];
                    }
                    target.right = Math.floor(targetRect.top + (targetRect.bottom - targetRect.top) / 2);

                    // bottom: the last
                    targetRect = rects[rects.length - 1];
                    target.bottom = Math.floor(targetRect.left + (targetRect.right - targetRect.left) / 2);

                    // left: the middle line, rounded up
                    if (rects.length > 2) {
                        targetRect = rects[Math.ceil((rects.length + 1) / 2) - 1];
                    } else {
                        targetRect = rects[rects.length - 1];
                    }

                    target.left = Math.floor(targetRect.top + (targetRect.bottom - targetRect.top) / 2);
                }

                return target;
            }
        }
    });

    /* a build task will add "return $;" here */
    return $;

}));

/**
 * tooltipster-follower v0.1.5
 * https://github.com/louisameline/tooltipster-follower/
 * Developed by Louis Ameline
 * MIT license
 */
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module unless amdModuleId is set
        define(["tooltipster"], function(a0) {
            return (factory(a0));
        });
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require("tooltipster"));
    } else {
        factory(jQuery);
    }
}(this, function($) {

    var pluginName = 'laa.follower';

    $.tooltipster._plugin({
        name: pluginName,
        instance: {
            /**
             * @return {object} An object with the defaults options
             * @private
             */
            __defaults: function() {

                return {
                    anchor: 'top-left',
                    maxWidth: null,
                    minWidth: 0,
                    offset: [15, -15]
                };
            },

            /**
             * Run once at instantiation of the plugin
             * 
             * @param {object} instance The tooltipster object that instantiated this plugin
             * @return {self}
             * @private
             */
            __init: function(instance) {

                var self = this;

                // list of instance variables

                self.__displayed;
                self.__helper;
                // the inition repositionOnScroll option value
                self.__initialROS = instance.option('repositionOnScroll');
                self.__instance = instance;
                self.__latestMouseEvent;
                self.__namespace = 'tooltipster-follower-' + Math.round(Math.random() * 1000000);
                self.__openingTouchEnded;
                self.__pointerPosition;
                self.__previousState = 'closed';
                self.__size;
                self.__options;

                // enable ROS (scrolling forces us to re-evaluate the window geometry)
                if (!self.__initialROS) {
                    self.__instance.option('repositionOnScroll', true);
                }

                // initial formatting
                self.__optionsFormat();

                // reformat every time the options are changed
                self.__instance._on('destroy.' + self.__namespace, function() {
                    self.__destroy();
                });

                // reformat every time the options are changed
                self.__instance._on('options.' + self.__namespace, function() {
                    self.__optionsFormat();
                });

                self.__instance._on('reposition.' + self.__namespace, function(event) {
                    self.__reposition(event.event, event.helper);
                });

                // we need to register the mousemove events before the tooltip is actually
                // opened, because the event that will be passed to __reposition at opening
                // will be the mouseenter event, which is too old and does not reflect the
                // current position of the mouse
                self.__instance._on('start.' + self.__namespace, function(event) {

                    self.__instance._$origin.on('mousemove.' + self.__namespace, function(e) {
                        self.__latestMouseEvent = e;
                    });
                });

                // undo the previous binding
                self.__instance._one('startend.' + self.__namespace + ' startcancel.' + self.__namespace, function(event) {

                    self.__instance._$origin.off('mousemove.' + self.__namespace);

                    // forget the event
                    if (event.type == 'startcancel') {
                        self.__latestMouseEvent = null;
                    }
                });

                self.__instance._on('state.' + self.__namespace, function(event) {

                    if (event.state == 'closed') {
                        self.__close();
                    } else if (event.state == 'appearing' && self.__previousState == 'closed') {
                        self.__create();
                    }

                    self.__previousState = event.state;
                });

                return self;
            },

            /**
             * Called when the tooltip has closed
             *
             * @return {self}
             * @private
             */
            __close: function() {

                // detach our content object first, so the next jQuery's remove()
                // call does not unbind its event handlers
                if (typeof this.__instance.content() == 'object' && this.__instance.content() !== null) {
                    this.__instance.content().detach();
                }

                // remove the tooltip from the DOM
                this.__instance._$tooltip.remove();
                this.__instance._$tooltip = null;

                // stop listening to mouse moves
                $($.tooltipster._env.window.document).off('.' + this.__namespace);

                // reset the event
                this.__latestMouseEvent = null;

                return this;
            },

            /**
             * Contains the HTML markup of the tooltip and the bindings the should
             * exist as long as the tooltip is open
             *
             * @return {self}
             * @private
             */
            __create: function() {

                var self = this,
                    // note: we wrap with a .tooltipster-box div to be able to set a margin on it
                    // (.tooltipster-base must not have one)
                    $html = $(
                        '<div class="tooltipster-base tooltipster-follower">' +
                        '<div class="tooltipster-box">' +
                        '<div class="tooltipster-content"></div>' +
                        '</div>' +
                        '</div>'
                    ),
                    $document = $($.tooltipster._env.window.document);

                // apply min/max width if asked
                if (self.__options.minWidth) {
                    $html.css('min-width', self.__options.minWidth + 'px');
                }
                if (self.__options.maxWidth) {
                    $html.css('max-width', self.__options.maxWidth + 'px');
                }

                self.__instance._$tooltip = $html;

                // not displayed until we have a mousemove event
                self.__displayed = false;
                self.__openingTouchEnded = false;

                $document.on('mousemove.' + self.__namespace, function(event) {

                    // don't follow the finger after the opening gesture has ended, if the tap
                    // close trigger is used. However we cannot ignore the event if we are right
                    // after the opening tap, since we must use to open it the first time
                    if (!self.__openingTouchEnded || !self.__displayed) {
                        self.__follow(event);
                    }
                });

                // This addresses the following situation: the user taps the tooltip open, then
                // taps somewhere else on the screen to close it. We'd expect the tooltip not to
                // move when the closing gesture is executed but it might be the case if the tap
                // is actually a touchstart+touchmove+touchend (which happens if the finger
                // slightly moves during the tap). Although it's only logical, we'll prevent it
                // as it would likely be unexpected by everyone. To do that, we'll unbind our
                // "move" listener when the opening gesture ends (if it even was a gesture that
                // opened the tooltip).
                var triggerClose = self.__instance.option('triggerClose');

                if (triggerClose.tap) {

                    // this will catch an opening tap event since we have (supposedly) been called
                    // upon the event on the origin and it has not bubbled to the document yet
                    $document.on('touchend.' + self.__namespace + ' touchcancel.' + self.__namespace, function(event) {

                        // we're not using a timeout to remove the mousemove listener since it
                        // break things for an unknown reason in Chrome mobile
                        self.__openingTouchEnded = true;
                    });
                }

                // tell the instance that the tooltip element has been created
                self.__instance._trigger('created');

                return self;
            },

            /**
             * Called upon the destruction of the tooltip or the destruction of the plugin
             * 
             * @return {self}
             * @private
             */
            __destroy: function() {

                this.__instance._off('.' + this.__namespace);

                if (!this.__initialROS) {
                    this.__instance.option('repositionOnScroll', false);
                }

                return this;
            },

            /**
             * Called when the mouse has moved.
             * 
             * Note: this is less "smart" than sideTip, which tests scenarios before choosing one.
             * Here we have to be fast so the moving animation can stay fluid. So there will be no
             * constrained widths for example.
             * 
             * @return {self}
             * @private
             */
            __follow: function(event) {

                // store the event in case it's a method call that triggers this method next time,
                // or use the latest mousemove event if we have one.
                if (event) {
                    this.__latestMouseEvent = event;
                } else if (this.__latestMouseEvent) {
                    event = this.__latestMouseEvent;
                }

                if (event) {

                    this.__displayed = true;

                    var coord = {},
                        anchor = this.__options.anchor,
                        offset = $.merge([], this.__options.offset);

                    // the scroll data of the helper must be updated manually on mousemove when the
                    // origin is fixed, because Tooltipster will not call __reposition on scroll, so
                    // it's out of date. Even though the tooltip will be fixed too, we need to know
                    // the scroll distance to determine the position of the pointer relatively to the
                    // viewport
                    this.__helper.geo.window.scroll = {
                        left: $.tooltipster._env.window.scrollX || $.tooltipster._env.window.document.documentElement.scrollLeft,
                        top: $.tooltipster._env.window.scrollY || $.tooltipster._env.window.document.documentElement.scrollTop
                    };

                    // coord left
                    switch (anchor) {

                        case 'top-left':
                        case 'left-center':
                        case 'bottom-left':
                            coord.left = event.pageX + offset[0];
                            break;

                        case 'top-center':
                        case 'bottom-center':
                            coord.left = event.pageX + offset[0] - this.__size.width / 2;
                            break;

                        case 'top-right':
                        case 'right-center':
                        case 'bottom-right':
                            coord.left = event.pageX + offset[0] - this.__size.width;
                            break;

                        default:
                            console.log('Wrong anchor value');
                            break;
                    }

                    // coord top
                    switch (anchor) {

                        case 'top-left':
                        case 'top-center':
                        case 'top-right':
                            // minus because the Y axis is reversed (pos above the X axis, neg below)
                            coord.top = event.pageY - offset[1];
                            break;

                        case 'left-center':
                        case 'right-center':
                            coord.top = event.pageY - offset[1] - this.__size.height / 2;
                            break;

                        case 'bottom-left':
                        case 'bottom-center':
                        case 'bottom-right':
                            coord.top = event.pageY - offset[1] - this.__size.height;
                            break;
                    }

                    // if the tooltip does not fit on the given side, see if it could fit on the
                    // opposite one, otherwise put at the bottom (which may be moved again to the
                    // top by the rest of the script below)
                    if (anchor == 'left-center' ||
                        anchor == 'right-center'
                    ) {

                        // if the tooltip is on the left of the cursor
                        if (anchor == 'right-center') {

                            // if it overflows the viewport on the left side
                            if (coord.left < this.__helper.geo.window.scroll.left) {

                                // if it wouldn't overflow on the right
                                if (event.pageX - offset[0] + this.__size.width <= this.__helper.geo.window.scroll.left + this.__helper.geo.window.size.width) {

                                    // move to the right
                                    anchor = 'left-center';
                                    // reverse the offset as well
                                    offset[0] = -offset[0];
                                    coord.left = event.pageX + offset[0];
                                } else {
                                    // move to the bottom left
                                    anchor = 'top-right';
                                    // we'll use the X offset to move the tooltip on the Y axis. Maybe
                                    // we'll make this configurable at some point
                                    offset[1] = offset[0];
                                    coord = {
                                        left: 0,
                                        top: event.pageY - offset[1]
                                    };
                                }
                            }
                        } else {

                            // if it overflows the viewport on the right side
                            if (coord.left + this.__size.width > this.__helper.geo.window.scroll.left + this.__helper.geo.window.size.width) {

                                var coordLeft = event.pageX - offset[0] - this.__size.width;

                                // if it wouldn't overflow on the left
                                if (coordLeft >= 0) {

                                    // move to the left
                                    anchor = 'right-center';
                                    // reverse the offset as well
                                    offset[0] = -offset[0];
                                    coord.left = coordLeft;
                                } else {
                                    // move to the bottom right
                                    anchor = 'top-left';
                                    offset[1] = -offset[0];
                                    coord = {
                                        left: event.pageX + offset[0],
                                        top: event.pageY - offset[1]
                                    };
                                }
                            }
                        }

                        // if it overflows the viewport at the bottom
                        if (coord.top + this.__size.height > this.__helper.geo.window.scroll.top + this.__helper.geo.window.size.height) {

                            // move up
                            coord.top = this.__helper.geo.window.scroll.top + this.__helper.geo.window.size.height - this.__size.height;
                        }
                        // if it overflows the viewport at the top
                        if (coord.top < this.__helper.geo.window.scroll.top) {

                            // move down
                            coord.top = this.__helper.geo.window.scroll.top;
                        }
                        // if it overflows the document at the bottom
                        if (coord.top + this.__size.height > this.__helper.geo.document.size.height) {

                            // move up
                            coord.top = this.__helper.geo.document.size.height - this.__size.height;
                        }
                        // if it overflows the document at the top
                        if (coord.top < 0) {

                            // no top document overflow
                            coord.top = 0;
                        }
                    }

                    // when the tooltip is not on a side, it may freely move horizontally because
                    // it won't go under the pointer
                    if (anchor != 'left-center' &&
                        anchor != 'right-center'
                    ) {

                        // left and right overflow

                        if (coord.left + this.__size.width > this.__helper.geo.window.scroll.left + this.__helper.geo.window.size.width) {
                            coord.left = this.__helper.geo.window.scroll.left + this.__helper.geo.window.size.width - this.__size.width;
                        }

                        // don't ever let document overflow on the left, only on the right, so the user
                        // can scroll. Note: right overflow should not happen often because when
                        // measuring the natural width, text is already broken to fit into the viewport.
                        if (coord.left < 0) {
                            coord.left = 0;
                        }

                        // top and bottom overflow

                        var pointerViewportY = event.pageY - this.__helper.geo.window.scroll.top;

                        // if the tooltip is above the pointer
                        if (anchor.indexOf('bottom') == 0) {

                            // if it overflows the viewport on top
                            if (coord.top < this.__helper.geo.window.scroll.top) {

                                // if the tooltip overflows the document at the top
                                if (coord.top < 0
                                    // if there is more space in the viewport below the pointer and that it won't
                                    // overflow the document, switch to the bottom. In the latter case, it might
                                    // seem odd not to switch to the bottom while there is more space, but the
                                    // idea is that the user couldn't close the tooltip, scroll down and try to
                                    // open it again, whereas he can do that at the top
                                    ||
                                    (pointerViewportY < this.__helper.geo.window.size.height - pointerViewportY &&
                                        event.pageY + offset[1] + this.__size.height <= this.__helper.geo.document.size.height
                                    )
                                ) {
                                    coord.top = event.pageY + offset[1];
                                }
                            }
                        }
                        // similar logic
                        else {

                            var coordBottom = coord.top + this.__size.height;

                            // if it overflows at the bottom
                            if (coordBottom > this.__helper.geo.window.scroll.top + this.__helper.geo.window.size.height) {

                                // if there is more space above the pointer or if it overflows the document
                                if (pointerViewportY > this.__helper.geo.window.size.height - pointerViewportY ||
                                    pointerViewportY - offset[1] + this.__size.height <= this.__helper.geo.document.size.height
                                ) {

                                    // move it unless it would overflow the document at the top too
                                    var coordTop = event.pageY + offset[1] - this.__size.height;

                                    if (coordTop >= 0) {
                                        coord.top = coordTop;
                                    }
                                }
                            }
                        }
                    }

                    // ignore the scroll distance if the origin is fixed
                    if (this.__helper.geo.origin.fixedLineage) {
                        coord.left -= this.__helper.geo.window.scroll.left;
                        coord.top -= this.__helper.geo.window.scroll.top;
                    }

                    var position = { coord: coord };

                    this.__instance._trigger({
                        edit: function(p) {
                            position = p;
                        },
                        event: event,
                        helper: this.__helper,
                        position: $.extend(true, {}, position),
                        type: 'follow'
                    });

                    this.__instance._$tooltip
                        .css({
                            left: position.coord.left,
                            top: position.coord.top
                        })
                        .show();
                } else {
                    // hide until a mouse event happens
                    this.__instance._$tooltip
                        .hide();
                }

                return this;
            },

            /**
             * (Re)compute this.__options from the options declared to the instance
             * 
             * @return {self}
             * @private
             */
            __optionsFormat: function() {
                this.__options = this.__instance._optionsExtract(pluginName, this.__defaults());
                return this;
            },

            /**
             * Called when Tooltipster thinks the tooltip should be repositioned/resized
             * (there can be many reasons for that). Tooltipster does not take mouse moves
             * into account, for that we have our own listeners that will adjust the
             * position (see __follow())
             * 
             * @return {self}
             * @private
             */
            __reposition: function(event, helper) {

                var self = this,
                    $clone = self.__instance._$tooltip.clone(),
                    // start position tests session
                    ruler = $.tooltipster._getRuler($clone),
                    animation = self.__instance.option('animation');

                // an animation class could contain properties that distort the size
                if (animation) {
                    $clone.removeClass('tooltipster-' + animation);
                }

                var rulerResults = ruler.free().measure(),
                    position = {
                        size: rulerResults.size
                    };

                // set position values on the original tooltip element

                if (helper.geo.origin.fixedLineage) {
                    self.__instance._$tooltip
                        .css('position', 'fixed');
                } else {
                    // CSS default
                    self.__instance._$tooltip
                        .css('position', '');
                }

                self.__instance._trigger({
                    edit: function(p) {
                        position = p;
                    },
                    event: event,
                    helper: helper,
                    position: $.extend(true, {}, position),
                    tooltipClone: $clone[0],
                    type: 'position'
                });

                // the clone won't be needed anymore
                ruler.destroy();

                // pass to __follow()
                self.__helper = helper;
                self.__size = position.size;

                // set the size here, the position in __follow()
                self.__instance._$tooltip
                    .css({
                        height: position.size.height,
                        width: position.size.width
                    });

                // reposition. We don't pass the event if it's a mouseenter/touchstart event as
                // it may be stale if it's the event that initially started an opening delay
                // (there may have been move events after that), so we rely on the events we
                // recorded ourselves instead. If it's a click event we'll use it but only in
                // IE because Chrome and Firefox trigger an additional mousemove event when the
                // mouse is clicked and that's enough for us.
                var e = ($.tooltipster._env.IE && event.type === 'click') ? event : null;

                self.__follow(e);

                // append the tooltip HTML element to its parent
                self.__instance._$tooltip.appendTo(self.__instance.option('parent'));

                // Currently, this event is meant to give the size of the tooltip to
                // Tooltipster. In the future, if it were also about its coordinates, we may
                // have to fire it at each mousemove
                self.__instance._trigger({
                    type: 'repositioned',
                    event: event,
                    position: {
                        // won't be used anyway since we enabled repositionOnScroll
                        coord: {
                            left: 0,
                            top: 0
                        },
                        // may be used by the tooltip tracker
                        size: position.size
                    }
                });

                return this;
            }
        }
    });

    /* a build task will add "return $;" here for UMD */
    return $;

}));

(function($, window, undefined) {
    $.fn.countdown = function(opts) {
        var defaults = {
            callback: function() {},
            timestamp: 0,
            duration: 360,
            soundURL: false,
            volume: 100
        }

        // extend the options from defaults with user's options
        var options = $.extend(defaults, opts || {});


        // Number of seconds in every time division
        var days = 24 * 60 * 60,
            hours = 60 * 60,
            minutes = 60;

        var countWidth = 148;
        var countHeight = 136;
        var frames = 6;

        var xShift = countWidth / 2;
        var yShift = countHeight * frames;

        var smZeroShift = 10 * yShift;
        var duration = parseInt(options.duration / 6);

        var left, d, h, m, s;



        //Time in milliseconds
        var timems = options.timestamp['days'] * 24 * 60 * 60 * 1000 +
            options.timestamp['hours'] * 60 * 60 * 1000 +
            options.timestamp['minutes'] * 60 * 1000 +
            options.timestamp['seconds'] * 1000;



        var mySound;
        if (typeof(soundManager) != "undefined" && options.soundURL) {

            soundManager.setup({
                onready: function() {
                    mySound = soundManager.createSound({
                        id: 'aSound',
                        url: options.soundURL,
                        volume: options.volume
                    })
                }
            });

        }


        function updateCount(elem, value, dPos) {
            // dPos - digit position
            // 0 - days
            // 1 - hours
            // 2 - minutes and seconds


            var digit = elem.find('.digit');

            var l = parseInt(digit.eq(0).text());
            var r = parseInt(digit.eq(1).text());

            nextL = Math.floor(value / 10) % 10;
            nextR = value % 10;

            if (digit.eq(0).text() == nextL && digit.eq(1).text() == nextR) {
                return false;
            }

            var i = 1;
            var yPosR = -(9 - r) * frames * countHeight;
            var xPosL = (r > 0) ? (-2 * xShift) : 0;
            var yPosL = -(9 - l) * frames * countHeight;
            var wordTop = 0;

            if (l == 0 && r == 0) {
                switch (dPos) {
                    case 2:
                        {
                            yPosL = -smZeroShift;
                            break;
                        }
                    case 1:
                        {
                            yPosL = -smZeroShift;
                            yPosR = -smZeroShift;
                            xPosL = (-2 * xShift);
                            break;
                        }
                    case 0:
                        {

                            break;
                        }
                }
            }

            setTimeout(function run() {

                if (i > 2) {
                    wordTop = (i >= frames) ? 0 : wordTop - countHeight;
                    elem.find('.countWord').css({ 'top': wordTop })
                }

                if (r == 0 && i == frames) {
                    yPosR = 0;
                } else {
                    yPosR = yPosR - countHeight;
                }

                if (l == 0 && i == frames && r == 0) {

                    switch (dPos) {
                        case 2:
                            {
                                yPosL = -(9 - 5) * frames * countHeight;
                                break;
                            }
                        case 1:
                            {
                                yPosL = -(9 - 2) * frames * countHeight;
                                yPosR = -(9 - 3) * frames * countHeight;
                                break;
                            }
                        case 0:
                            {

                                break;
                            }
                    }
                } else {
                    if (i == (frames) && r > 0) {
                        yPosL = yPosL + (frames - 1) * countHeight;
                    } else {
                        yPosL = yPosL - countHeight;
                    }
                }

                i++;
                digit.eq(1).css({ 'top': yPosR })
                digit.eq(0).css({ 'top': yPosL, 'left': xPosL })
                if (i <= frames) {
                    setTimeout(run, duration);
                } else {
                    if (typeof(soundManager) != "undefined" && options.soundURL) { mySound.play(); }
                }
            }, duration);
            digit.eq(0).text(nextL);
            digit.eq(1).text(nextR);

        }

        function startPos(elem, dPos) {
            // dPos - digit position
            // 0 - days
            // 1 - hours
            // 2 - minutes and seconds

            var digit = elem.find('.digit');

            var l = parseInt(digit.eq(0).text());
            var r = parseInt(digit.eq(1).text());


            digit.eq(1).css({ 'top': -yShift * (9 - r), 'left': -xShift });

            if (r > 0) {
                digit.eq(0).css({ 'top': -yShift * (9 - l), 'left': -2 * xShift });

            } else {
                if (l > 0) {
                    digit.eq(0).css({ 'top': -yShift * (9 - l), 'left': 0 });
                } else {
                    switch (dPos) {
                        case 2:
                            {
                                digit.eq(0).css({ 'top': -smZeroShift, 'left': 0 });
                                break;
                            }
                        case 1:
                            {
                                digit.eq(0).css({ 'top': -smZeroShift, 'left': -2 * xShift });
                                digit.eq(1).css({ 'top': -smZeroShift, 'left': -xShift });
                                break;
                            }
                        default:
                            {
                                digit.eq(0).css({ 'top': -yShift * (9 - l), 'left': 0 });
                            }
                    }
                }
            }

        }

        function init(elem, options) {
            elem.addClass('countdownHolder')
                .wrap('<div class="countdownWrap"></div>')
                .parent().append('<div class="countdownRight"></div>')
                .prepend('<div class="countdownLeft"></div>');

            // Creating the markup inside the container
            $.each(['days', 'hours', 'minutes', 'seconds'], function(i) {

                $('<span class="count-' + this + '"></span>').html(
                    '<span class="position count-l">\
              <div class="countWord"></div>\
              <span class="digit">' + Math.floor(options.timestamp[this] / 10) % 10 + '</span>\
            </span>\
            <span class="position count-r">\
              <div class="countWord"></div>\
              <span class="digit">' + options.timestamp[this] % 10 + '</span>\
            </span>'
                ).appendTo(elem);


            });

        }
        return this.each(function() {
            // Initialize the plugin
            init($(this), options);

            var ts = (new Date()).getTime() + timems;
            var countS = $(this).find('.count-seconds');
            var countM = $(this).find('.count-minutes');
            var countH = $(this).find('.count-hours');
            var countD = $(this).find('.count-days');

            var word = $(this).find('.countWord').each(function(i) {
                $(this).css({ 'left': -i * xShift })
            })

            startPos(countS, 2);
            startPos(countM, 2);
            startPos(countH, 1);
            startPos(countD, 0);

            (function tick() {

                // Time left
                left = Math.floor((ts - (new Date())) / 1000);

                if (left < 0) {
                    left = 0;
                }
                // Number of days left
                d = Math.floor(left / days);
                left -= d * days;
                updateCount(countD, d, 0)
                    // Number of hours left
                h = Math.floor(left / hours);
                left -= h * hours;
                updateCount(countH, h, 1)


                // Number of minutes left
                m = Math.floor(left / minutes);
                updateCount(countM, m, 2)
                left -= m * minutes;

                // Number of seconds left
                s = left;
                updateCount(countS, s, 2)

                // Calling an optional user supplied callback
                options.callback(d, h, m, s);

                // Scheduling another call of this function in 1s
                setTimeout(tick, 1000);
            })();
        });
    }
})(jQuery, window);








/* -----------------------------------------------
/* Author : Vincent Garreau  - vincentgarreau.com
/* MIT license: http://opensource.org/licenses/MIT
/* Demo / Generator : vincentgarreau.com/particles.js
/* GitHub : github.com/VincentGarreau/particles.js
/* How to use? : Check the GitHub README
/* v2.0.0
/* ----------------------------------------------- */

var pJS = function(tag_id, params) {

    var canvas_el = document.querySelector('#' + tag_id + ' > .particles-js-canvas-el');

    /* particles.js variables with default values */
    this.pJS = {
        canvas: {
            el: canvas_el,
            w: canvas_el.offsetWidth,
            h: canvas_el.offsetHeight
        },
        particles: {
            number: {
                value: 400,
                density: {
                    enable: true,
                    value_area: 800
                }
            },
            color: {
                value: '#fff'
            },
            shape: {
                type: 'circle',
                stroke: {
                    width: 0,
                    color: '#ff0000'
                },
                polygon: {
                    nb_sides: 5
                },
                image: {
                    src: '',
                    width: 100,
                    height: 100
                }
            },
            opacity: {
                value: 1,
                random: false,
                anim: {
                    enable: false,
                    speed: 2,
                    opacity_min: 0,
                    sync: false
                }
            },
            size: {
                value: 20,
                random: false,
                anim: {
                    enable: false,
                    speed: 20,
                    size_min: 0,
                    sync: false
                }
            },
            line_linked: {
                enable: true,
                distance: 100,
                color: '#fff',
                opacity: 1,
                width: 1
            },
            move: {
                enable: true,
                speed: 2,
                direction: 'none',
                random: false,
                straight: false,
                out_mode: 'out',
                bounce: false,
                attract: {
                    enable: false,
                    rotateX: 3000,
                    rotateY: 3000
                }
            },
            array: []
        },
        interactivity: {
            detect_on: 'canvas',
            events: {
                onhover: {
                    enable: true,
                    mode: 'grab'
                },
                onclick: {
                    enable: true,
                    mode: 'push'
                },
                resize: true
            },
            modes: {
                grab: {
                    distance: 100,
                    line_linked: {
                        opacity: 1
                    }
                },
                bubble: {
                    distance: 200,
                    size: 80,
                    duration: 0.4
                },
                repulse: {
                    distance: 200,
                    duration: 0.4
                },
                push: {
                    particles_nb: 4
                },
                remove: {
                    particles_nb: 2
                }
            },
            mouse: {}
        },
        retina_detect: false,
        fn: {
            interact: {},
            modes: {},
            vendors: {}
        },
        tmp: {}
    };

    var pJS = this.pJS;

    /* params settings */
    if (params) {
        Object.deepExtend(pJS, params);
    }

    pJS.tmp.obj = {
        size_value: pJS.particles.size.value,
        size_anim_speed: pJS.particles.size.anim.speed,
        move_speed: pJS.particles.move.speed,
        line_linked_distance: pJS.particles.line_linked.distance,
        line_linked_width: pJS.particles.line_linked.width,
        mode_grab_distance: pJS.interactivity.modes.grab.distance,
        mode_bubble_distance: pJS.interactivity.modes.bubble.distance,
        mode_bubble_size: pJS.interactivity.modes.bubble.size,
        mode_repulse_distance: pJS.interactivity.modes.repulse.distance
    };


    pJS.fn.retinaInit = function() {

        if (pJS.retina_detect && window.devicePixelRatio > 1) {
            pJS.canvas.pxratio = window.devicePixelRatio;
            pJS.tmp.retina = true;
        } else {
            pJS.canvas.pxratio = 1;
            pJS.tmp.retina = false;
        }

        pJS.canvas.w = pJS.canvas.el.offsetWidth * pJS.canvas.pxratio;
        pJS.canvas.h = pJS.canvas.el.offsetHeight * pJS.canvas.pxratio;

        pJS.particles.size.value = pJS.tmp.obj.size_value * pJS.canvas.pxratio;
        pJS.particles.size.anim.speed = pJS.tmp.obj.size_anim_speed * pJS.canvas.pxratio;
        pJS.particles.move.speed = pJS.tmp.obj.move_speed * pJS.canvas.pxratio;
        pJS.particles.line_linked.distance = pJS.tmp.obj.line_linked_distance * pJS.canvas.pxratio;
        pJS.interactivity.modes.grab.distance = pJS.tmp.obj.mode_grab_distance * pJS.canvas.pxratio;
        pJS.interactivity.modes.bubble.distance = pJS.tmp.obj.mode_bubble_distance * pJS.canvas.pxratio;
        pJS.particles.line_linked.width = pJS.tmp.obj.line_linked_width * pJS.canvas.pxratio;
        pJS.interactivity.modes.bubble.size = pJS.tmp.obj.mode_bubble_size * pJS.canvas.pxratio;
        pJS.interactivity.modes.repulse.distance = pJS.tmp.obj.mode_repulse_distance * pJS.canvas.pxratio;

    };



    /* ---------- pJS functions - canvas ------------ */

    pJS.fn.canvasInit = function() {
        pJS.canvas.ctx = pJS.canvas.el.getContext('2d');
    };

    pJS.fn.canvasSize = function() {

        pJS.canvas.el.width = pJS.canvas.w;
        pJS.canvas.el.height = pJS.canvas.h;

        if (pJS && pJS.interactivity.events.resize) {

            window.addEventListener('resize', function() {

                pJS.canvas.w = pJS.canvas.el.offsetWidth;
                pJS.canvas.h = pJS.canvas.el.offsetHeight;

                /* resize canvas */
                if (pJS.tmp.retina) {
                    pJS.canvas.w *= pJS.canvas.pxratio;
                    pJS.canvas.h *= pJS.canvas.pxratio;
                }

                pJS.canvas.el.width = pJS.canvas.w;
                pJS.canvas.el.height = pJS.canvas.h;

                /* repaint canvas on anim disabled */
                if (!pJS.particles.move.enable) {
                    pJS.fn.particlesEmpty();
                    pJS.fn.particlesCreate();
                    pJS.fn.particlesDraw();
                    pJS.fn.vendors.densityAutoParticles();
                }

                /* density particles enabled */
                pJS.fn.vendors.densityAutoParticles();

            });

        }

    };


    pJS.fn.canvasPaint = function() {
        pJS.canvas.ctx.fillRect(0, 0, pJS.canvas.w, pJS.canvas.h);
    };

    pJS.fn.canvasClear = function() {
        pJS.canvas.ctx.clearRect(0, 0, pJS.canvas.w, pJS.canvas.h);
    };


    /* --------- pJS functions - particles ----------- */

    pJS.fn.particle = function(color, opacity, position) {

        /* size */
        this.radius = (pJS.particles.size.random ? Math.random() : 1) * pJS.particles.size.value;
        if (pJS.particles.size.anim.enable) {
            this.size_status = false;
            this.vs = pJS.particles.size.anim.speed / 100;
            if (!pJS.particles.size.anim.sync) {
                this.vs = this.vs * Math.random();
            }
        }

        /* position */
        this.x = position ? position.x : Math.random() * pJS.canvas.w;
        this.y = position ? position.y : Math.random() * pJS.canvas.h;

        /* check position  - into the canvas */
        if (this.x > pJS.canvas.w - this.radius * 2) this.x = this.x - this.radius;
        else if (this.x < this.radius * 2) this.x = this.x + this.radius;
        if (this.y > pJS.canvas.h - this.radius * 2) this.y = this.y - this.radius;
        else if (this.y < this.radius * 2) this.y = this.y + this.radius;

        /* check position - avoid overlap */
        if (pJS.particles.move.bounce) {
            pJS.fn.vendors.checkOverlap(this, position);
        }

        /* color */
        this.color = {};
        if (typeof(color.value) == 'object') {

            if (color.value instanceof Array) {
                var color_selected = color.value[Math.floor(Math.random() * pJS.particles.color.value.length)];
                this.color.rgb = hexToRgb(color_selected);
            } else {
                if (color.value.r != undefined && color.value.g != undefined && color.value.b != undefined) {
                    this.color.rgb = {
                        r: color.value.r,
                        g: color.value.g,
                        b: color.value.b
                    }
                }
                if (color.value.h != undefined && color.value.s != undefined && color.value.l != undefined) {
                    this.color.hsl = {
                        h: color.value.h,
                        s: color.value.s,
                        l: color.value.l
                    }
                }
            }

        } else if (color.value == 'random') {
            this.color.rgb = {
                r: (Math.floor(Math.random() * (255 - 0 + 1)) + 0),
                g: (Math.floor(Math.random() * (255 - 0 + 1)) + 0),
                b: (Math.floor(Math.random() * (255 - 0 + 1)) + 0)
            }
        } else if (typeof(color.value) == 'string') {
            this.color = color;
            this.color.rgb = hexToRgb(this.color.value);
        }

        /* opacity */
        this.opacity = (pJS.particles.opacity.random ? Math.random() : 1) * pJS.particles.opacity.value;
        if (pJS.particles.opacity.anim.enable) {
            this.opacity_status = false;
            this.vo = pJS.particles.opacity.anim.speed / 100;
            if (!pJS.particles.opacity.anim.sync) {
                this.vo = this.vo * Math.random();
            }
        }

        /* animation - velocity for speed */
        var velbase = {}
        switch (pJS.particles.move.direction) {
            case 'top':
                velbase = { x: 0, y: -1 };
                break;
            case 'top-right':
                velbase = { x: 0.5, y: -0.5 };
                break;
            case 'right':
                velbase = { x: 1, y: -0 };
                break;
            case 'bottom-right':
                velbase = { x: 0.5, y: 0.5 };
                break;
            case 'bottom':
                velbase = { x: 0, y: 1 };
                break;
            case 'bottom-left':
                velbase = { x: -0.5, y: 1 };
                break;
            case 'left':
                velbase = { x: -1, y: 0 };
                break;
            case 'top-left':
                velbase = { x: -0.5, y: -0.5 };
                break;
            default:
                velbase = { x: 0, y: 0 };
                break;
        }

        if (pJS.particles.move.straight) {
            this.vx = velbase.x;
            this.vy = velbase.y;
            if (pJS.particles.move.random) {
                this.vx = this.vx * (Math.random());
                this.vy = this.vy * (Math.random());
            }
        } else {
            this.vx = velbase.x + Math.random() - 0.5;
            this.vy = velbase.y + Math.random() - 0.5;
        }

        // var theta = 2.0 * Math.PI * Math.random();
        // this.vx = Math.cos(theta);
        // this.vy = Math.sin(theta);

        this.vx_i = this.vx;
        this.vy_i = this.vy;



        /* if shape is image */

        var shape_type = pJS.particles.shape.type;
        if (typeof(shape_type) == 'object') {
            if (shape_type instanceof Array) {
                var shape_selected = shape_type[Math.floor(Math.random() * shape_type.length)];
                this.shape = shape_selected;
            }
        } else {
            this.shape = shape_type;
        }

        if (this.shape == 'image') {
            var sh = pJS.particles.shape;
            this.img = {
                src: sh.image.src,
                ratio: sh.image.width / sh.image.height
            }
            if (!this.img.ratio) this.img.ratio = 1;
            if (pJS.tmp.img_type == 'svg' && pJS.tmp.source_svg != undefined) {
                pJS.fn.vendors.createSvgImg(this);
                if (pJS.tmp.pushing) {
                    this.img.loaded = false;
                }
            }
        }



    };


    pJS.fn.particle.prototype.draw = function() {

        var p = this;

        if (p.radius_bubble != undefined) {
            var radius = p.radius_bubble;
        } else {
            var radius = p.radius;
        }

        if (p.opacity_bubble != undefined) {
            var opacity = p.opacity_bubble;
        } else {
            var opacity = p.opacity;
        }

        if (p.color.rgb) {
            var color_value = 'rgba(' + p.color.rgb.r + ',' + p.color.rgb.g + ',' + p.color.rgb.b + ',' + opacity + ')';
        } else {
            var color_value = 'hsla(' + p.color.hsl.h + ',' + p.color.hsl.s + '%,' + p.color.hsl.l + '%,' + opacity + ')';
        }

        pJS.canvas.ctx.fillStyle = color_value;
        pJS.canvas.ctx.beginPath();

        switch (p.shape) {

            case 'circle':
                pJS.canvas.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2, false);
                break;

            case 'edge':
                pJS.canvas.ctx.rect(p.x - radius, p.y - radius, radius * 2, radius * 2);
                break;

            case 'triangle':
                pJS.fn.vendors.drawShape(pJS.canvas.ctx, p.x - radius, p.y + radius / 1.66, radius * 2, 3, 2);
                break;

            case 'polygon':
                pJS.fn.vendors.drawShape(
                    pJS.canvas.ctx,
                    p.x - radius / (pJS.particles.shape.polygon.nb_sides / 3.5), // startX
                    p.y - radius / (2.66 / 3.5), // startY
                    radius * 2.66 / (pJS.particles.shape.polygon.nb_sides / 3), // sideLength
                    pJS.particles.shape.polygon.nb_sides, // sideCountNumerator
                    1 // sideCountDenominator
                );
                break;

            case 'star':
                pJS.fn.vendors.drawShape(
                    pJS.canvas.ctx,
                    p.x - radius * 2 / (pJS.particles.shape.polygon.nb_sides / 4), // startX
                    p.y - radius / (2 * 2.66 / 3.5), // startY
                    radius * 2 * 2.66 / (pJS.particles.shape.polygon.nb_sides / 3), // sideLength
                    pJS.particles.shape.polygon.nb_sides, // sideCountNumerator
                    2 // sideCountDenominator
                );
                break;

            case 'image':

                function draw() {
                    pJS.canvas.ctx.drawImage(
                        img_obj,
                        p.x - radius,
                        p.y - radius,
                        radius * 2,
                        radius * 2 / p.img.ratio
                    );
                }

                if (pJS.tmp.img_type == 'svg') {
                    var img_obj = p.img.obj;
                } else {
                    var img_obj = pJS.tmp.img_obj;
                }

                if (img_obj) {
                    draw();
                }

                break;

        }

        pJS.canvas.ctx.closePath();

        if (pJS.particles.shape.stroke.width > 0) {
            pJS.canvas.ctx.strokeStyle = pJS.particles.shape.stroke.color;
            pJS.canvas.ctx.lineWidth = pJS.particles.shape.stroke.width;
            pJS.canvas.ctx.stroke();
        }

        pJS.canvas.ctx.fill();

    };


    pJS.fn.particlesCreate = function() {
        for (var i = 0; i < pJS.particles.number.value; i++) {
            pJS.particles.array.push(new pJS.fn.particle(pJS.particles.color, pJS.particles.opacity.value));
        }
    };

    pJS.fn.particlesUpdate = function() {

        for (var i = 0; i < pJS.particles.array.length; i++) {

            /* the particle */
            var p = pJS.particles.array[i];

            // var d = ( dx = pJS.interactivity.mouse.click_pos_x - p.x ) * dx + ( dy = pJS.interactivity.mouse.click_pos_y - p.y ) * dy;
            // var f = -BANG_SIZE / d;
            // if ( d < BANG_SIZE ) {
            //     var t = Math.atan2( dy, dx );
            //     p.vx = f * Math.cos(t);
            //     p.vy = f * Math.sin(t);
            // }

            /* move the particle */
            if (pJS.particles.move.enable) {
                var ms = pJS.particles.move.speed / 2;
                p.x += p.vx * ms;
                p.y += p.vy * ms;
            }

            /* change opacity status */
            if (pJS.particles.opacity.anim.enable) {
                if (p.opacity_status == true) {
                    if (p.opacity >= pJS.particles.opacity.value) p.opacity_status = false;
                    p.opacity += p.vo;
                } else {
                    if (p.opacity <= pJS.particles.opacity.anim.opacity_min) p.opacity_status = true;
                    p.opacity -= p.vo;
                }
                if (p.opacity < 0) p.opacity = 0;
            }

            /* change size */
            if (pJS.particles.size.anim.enable) {
                if (p.size_status == true) {
                    if (p.radius >= pJS.particles.size.value) p.size_status = false;
                    p.radius += p.vs;
                } else {
                    if (p.radius <= pJS.particles.size.anim.size_min) p.size_status = true;
                    p.radius -= p.vs;
                }
                if (p.radius < 0) p.radius = 0;
            }

            /* change particle position if it is out of canvas */
            if (pJS.particles.move.out_mode == 'bounce') {
                var new_pos = {
                    x_left: p.radius,
                    x_right: pJS.canvas.w,
                    y_top: p.radius,
                    y_bottom: pJS.canvas.h
                }
            } else {
                var new_pos = {
                    x_left: -p.radius,
                    x_right: pJS.canvas.w + p.radius,
                    y_top: -p.radius,
                    y_bottom: pJS.canvas.h + p.radius
                }
            }

            if (p.x - p.radius > pJS.canvas.w) {
                p.x = new_pos.x_left;
                p.y = Math.random() * pJS.canvas.h;
            } else if (p.x + p.radius < 0) {
                p.x = new_pos.x_right;
                p.y = Math.random() * pJS.canvas.h;
            }
            if (p.y - p.radius > pJS.canvas.h) {
                p.y = new_pos.y_top;
                p.x = Math.random() * pJS.canvas.w;
            } else if (p.y + p.radius < 0) {
                p.y = new_pos.y_bottom;
                p.x = Math.random() * pJS.canvas.w;
            }

            /* out of canvas modes */
            switch (pJS.particles.move.out_mode) {
                case 'bounce':
                    if (p.x + p.radius > pJS.canvas.w) p.vx = -p.vx;
                    else if (p.x - p.radius < 0) p.vx = -p.vx;
                    if (p.y + p.radius > pJS.canvas.h) p.vy = -p.vy;
                    else if (p.y - p.radius < 0) p.vy = -p.vy;
                    break;
            }

            /* events */
            if (isInArray('grab', pJS.interactivity.events.onhover.mode)) {
                pJS.fn.modes.grabParticle(p);
            }

            if (isInArray('bubble', pJS.interactivity.events.onhover.mode) || isInArray('bubble', pJS.interactivity.events.onclick.mode)) {
                pJS.fn.modes.bubbleParticle(p);
            }

            if (isInArray('repulse', pJS.interactivity.events.onhover.mode) || isInArray('repulse', pJS.interactivity.events.onclick.mode)) {
                pJS.fn.modes.repulseParticle(p);
            }

            /* interaction auto between particles */
            if (pJS.particles.line_linked.enable || pJS.particles.move.attract.enable) {
                for (var j = i + 1; j < pJS.particles.array.length; j++) {
                    var p2 = pJS.particles.array[j];

                    /* link particles */
                    if (pJS.particles.line_linked.enable) {
                        pJS.fn.interact.linkParticles(p, p2);
                    }

                    /* attract particles */
                    if (pJS.particles.move.attract.enable) {
                        pJS.fn.interact.attractParticles(p, p2);
                    }

                    /* bounce particles */
                    if (pJS.particles.move.bounce) {
                        pJS.fn.interact.bounceParticles(p, p2);
                    }

                }
            }


        }

    };

    pJS.fn.particlesDraw = function() {

        /* clear canvas */
        pJS.canvas.ctx.clearRect(0, 0, pJS.canvas.w, pJS.canvas.h);

        /* update each particles param */
        pJS.fn.particlesUpdate();

        /* draw each particle */
        for (var i = 0; i < pJS.particles.array.length; i++) {
            var p = pJS.particles.array[i];
            p.draw();
        }

    };

    pJS.fn.particlesEmpty = function() {
        pJS.particles.array = [];
    };

    pJS.fn.particlesRefresh = function() {

        /* init all */
        cancelRequestAnimFrame(pJS.fn.checkAnimFrame);
        cancelRequestAnimFrame(pJS.fn.drawAnimFrame);
        pJS.tmp.source_svg = undefined;
        pJS.tmp.img_obj = undefined;
        pJS.tmp.count_svg = 0;
        pJS.fn.particlesEmpty();
        pJS.fn.canvasClear();

        /* restart */
        pJS.fn.vendors.start();

    };


    /* ---------- pJS functions - particles interaction ------------ */

    pJS.fn.interact.linkParticles = function(p1, p2) {

        var dx = p1.x - p2.x,
            dy = p1.y - p2.y,
            dist = Math.sqrt(dx * dx + dy * dy);

        /* draw a line between p1 and p2 if the distance between them is under the config distance */
        if (dist <= pJS.particles.line_linked.distance) {

            var opacity_line = pJS.particles.line_linked.opacity - (dist / (1 / pJS.particles.line_linked.opacity)) / pJS.particles.line_linked.distance;

            if (opacity_line > 0) {

                /* style */
                var color_line = pJS.particles.line_linked.color_rgb_line;
                pJS.canvas.ctx.strokeStyle = 'rgba(' + color_line.r + ',' + color_line.g + ',' + color_line.b + ',' + opacity_line + ')';
                pJS.canvas.ctx.lineWidth = pJS.particles.line_linked.width;
                //pJS.canvas.ctx.lineCap = 'round'; /* performance issue */

                /* path */
                pJS.canvas.ctx.beginPath();
                pJS.canvas.ctx.moveTo(p1.x, p1.y);
                pJS.canvas.ctx.lineTo(p2.x, p2.y);
                pJS.canvas.ctx.stroke();
                pJS.canvas.ctx.closePath();

            }

        }

    };


    pJS.fn.interact.attractParticles = function(p1, p2) {

        /* condensed particles */
        var dx = p1.x - p2.x,
            dy = p1.y - p2.y,
            dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= pJS.particles.line_linked.distance) {

            var ax = dx / (pJS.particles.move.attract.rotateX * 1000),
                ay = dy / (pJS.particles.move.attract.rotateY * 1000);

            p1.vx -= ax;
            p1.vy -= ay;

            p2.vx += ax;
            p2.vy += ay;

        }


    }


    pJS.fn.interact.bounceParticles = function(p1, p2) {

        var dx = p1.x - p2.x,
            dy = p1.y - p2.y,
            dist = Math.sqrt(dx * dx + dy * dy),
            dist_p = p1.radius + p2.radius;

        if (dist <= dist_p) {
            p1.vx = -p1.vx;
            p1.vy = -p1.vy;

            p2.vx = -p2.vx;
            p2.vy = -p2.vy;
        }

    }


    /* ---------- pJS functions - modes events ------------ */

    pJS.fn.modes.pushParticles = function(nb, pos) {

        pJS.tmp.pushing = true;

        for (var i = 0; i < nb; i++) {
            pJS.particles.array.push(
                new pJS.fn.particle(
                    pJS.particles.color,
                    pJS.particles.opacity.value, {
                        'x': pos ? pos.pos_x : Math.random() * pJS.canvas.w,
                        'y': pos ? pos.pos_y : Math.random() * pJS.canvas.h
                    }
                )
            )
            if (i == nb - 1) {
                if (!pJS.particles.move.enable) {
                    pJS.fn.particlesDraw();
                }
                pJS.tmp.pushing = false;
            }
        }

    };


    pJS.fn.modes.removeParticles = function(nb) {

        pJS.particles.array.splice(0, nb);
        if (!pJS.particles.move.enable) {
            pJS.fn.particlesDraw();
        }

    };


    pJS.fn.modes.bubbleParticle = function(p) {

        /* on hover event */
        if (pJS.interactivity.events.onhover.enable && isInArray('bubble', pJS.interactivity.events.onhover.mode)) {

            var dx_mouse = p.x - pJS.interactivity.mouse.pos_x,
                dy_mouse = p.y - pJS.interactivity.mouse.pos_y,
                dist_mouse = Math.sqrt(dx_mouse * dx_mouse + dy_mouse * dy_mouse),
                ratio = 1 - dist_mouse / pJS.interactivity.modes.bubble.distance;

            function init() {
                p.opacity_bubble = p.opacity;
                p.radius_bubble = p.radius;
            }

            /* mousemove - check ratio */
            if (dist_mouse <= pJS.interactivity.modes.bubble.distance) {

                if (ratio >= 0 && pJS.interactivity.status == 'mousemove') {

                    /* size */
                    if (pJS.interactivity.modes.bubble.size != pJS.particles.size.value) {

                        if (pJS.interactivity.modes.bubble.size > pJS.particles.size.value) {
                            var size = p.radius + (pJS.interactivity.modes.bubble.size * ratio);
                            if (size >= 0) {
                                p.radius_bubble = size;
                            }
                        } else {
                            var dif = p.radius - pJS.interactivity.modes.bubble.size,
                                size = p.radius - (dif * ratio);
                            if (size > 0) {
                                p.radius_bubble = size;
                            } else {
                                p.radius_bubble = 0;
                            }
                        }

                    }

                    /* opacity */
                    if (pJS.interactivity.modes.bubble.opacity != pJS.particles.opacity.value) {

                        if (pJS.interactivity.modes.bubble.opacity > pJS.particles.opacity.value) {
                            var opacity = pJS.interactivity.modes.bubble.opacity * ratio;
                            if (opacity > p.opacity && opacity <= pJS.interactivity.modes.bubble.opacity) {
                                p.opacity_bubble = opacity;
                            }
                        } else {
                            var opacity = p.opacity - (pJS.particles.opacity.value - pJS.interactivity.modes.bubble.opacity) * ratio;
                            if (opacity < p.opacity && opacity >= pJS.interactivity.modes.bubble.opacity) {
                                p.opacity_bubble = opacity;
                            }
                        }

                    }

                }

            } else {
                init();
            }


            /* mouseleave */
            if (pJS.interactivity.status == 'mouseleave') {
                init();
            }

        }

        /* on click event */
        else if (pJS.interactivity.events.onclick.enable && isInArray('bubble', pJS.interactivity.events.onclick.mode)) {


            if (pJS.tmp.bubble_clicking) {
                var dx_mouse = p.x - pJS.interactivity.mouse.click_pos_x,
                    dy_mouse = p.y - pJS.interactivity.mouse.click_pos_y,
                    dist_mouse = Math.sqrt(dx_mouse * dx_mouse + dy_mouse * dy_mouse),
                    time_spent = (new Date().getTime() - pJS.interactivity.mouse.click_time) / 1000;

                if (time_spent > pJS.interactivity.modes.bubble.duration) {
                    pJS.tmp.bubble_duration_end = true;
                }

                if (time_spent > pJS.interactivity.modes.bubble.duration * 2) {
                    pJS.tmp.bubble_clicking = false;
                    pJS.tmp.bubble_duration_end = false;
                }
            }


            function process(bubble_param, particles_param, p_obj_bubble, p_obj, id) {

                if (bubble_param != particles_param) {

                    if (!pJS.tmp.bubble_duration_end) {
                        if (dist_mouse <= pJS.interactivity.modes.bubble.distance) {
                            if (p_obj_bubble != undefined) var obj = p_obj_bubble;
                            else var obj = p_obj;
                            if (obj != bubble_param) {
                                var value = p_obj - (time_spent * (p_obj - bubble_param) / pJS.interactivity.modes.bubble.duration);
                                if (id == 'size') p.radius_bubble = value;
                                if (id == 'opacity') p.opacity_bubble = value;
                            }
                        } else {
                            if (id == 'size') p.radius_bubble = undefined;
                            if (id == 'opacity') p.opacity_bubble = undefined;
                        }
                    } else {
                        if (p_obj_bubble != undefined) {
                            var value_tmp = p_obj - (time_spent * (p_obj - bubble_param) / pJS.interactivity.modes.bubble.duration),
                                dif = bubble_param - value_tmp;
                            value = bubble_param + dif;
                            if (id == 'size') p.radius_bubble = value;
                            if (id == 'opacity') p.opacity_bubble = value;
                        }
                    }

                }

            }

            if (pJS.tmp.bubble_clicking) {
                /* size */
                process(pJS.interactivity.modes.bubble.size, pJS.particles.size.value, p.radius_bubble, p.radius, 'size');
                /* opacity */
                process(pJS.interactivity.modes.bubble.opacity, pJS.particles.opacity.value, p.opacity_bubble, p.opacity, 'opacity');
            }

        }

    };


    pJS.fn.modes.repulseParticle = function(p) {

        if (pJS.interactivity.events.onhover.enable && isInArray('repulse', pJS.interactivity.events.onhover.mode) && pJS.interactivity.status == 'mousemove') {

            var dx_mouse = p.x - pJS.interactivity.mouse.pos_x,
                dy_mouse = p.y - pJS.interactivity.mouse.pos_y,
                dist_mouse = Math.sqrt(dx_mouse * dx_mouse + dy_mouse * dy_mouse);

            var normVec = { x: dx_mouse / dist_mouse, y: dy_mouse / dist_mouse },
                repulseRadius = pJS.interactivity.modes.repulse.distance,
                velocity = 100,
                repulseFactor = clamp((1 / repulseRadius) * (-1 * Math.pow(dist_mouse / repulseRadius, 2) + 1) * repulseRadius * velocity, 0, 50);

            var pos = {
                x: p.x + normVec.x * repulseFactor,
                y: p.y + normVec.y * repulseFactor
            }

            if (pJS.particles.move.out_mode == 'bounce') {
                if (pos.x - p.radius > 0 && pos.x + p.radius < pJS.canvas.w) p.x = pos.x;
                if (pos.y - p.radius > 0 && pos.y + p.radius < pJS.canvas.h) p.y = pos.y;
            } else {
                p.x = pos.x;
                p.y = pos.y;
            }

        } else if (pJS.interactivity.events.onclick.enable && isInArray('repulse', pJS.interactivity.events.onclick.mode)) {

            if (!pJS.tmp.repulse_finish) {
                pJS.tmp.repulse_count++;
                if (pJS.tmp.repulse_count == pJS.particles.array.length) {
                    pJS.tmp.repulse_finish = true;
                }
            }

            if (pJS.tmp.repulse_clicking) {

                var repulseRadius = Math.pow(pJS.interactivity.modes.repulse.distance / 6, 3);

                var dx = pJS.interactivity.mouse.click_pos_x - p.x,
                    dy = pJS.interactivity.mouse.click_pos_y - p.y,
                    d = dx * dx + dy * dy;

                var force = -repulseRadius / d * 1;

                function process() {

                    var f = Math.atan2(dy, dx);
                    p.vx = force * Math.cos(f);
                    p.vy = force * Math.sin(f);

                    if (pJS.particles.move.out_mode == 'bounce') {
                        var pos = {
                            x: p.x + p.vx,
                            y: p.y + p.vy
                        }
                        if (pos.x + p.radius > pJS.canvas.w) p.vx = -p.vx;
                        else if (pos.x - p.radius < 0) p.vx = -p.vx;
                        if (pos.y + p.radius > pJS.canvas.h) p.vy = -p.vy;
                        else if (pos.y - p.radius < 0) p.vy = -p.vy;
                    }

                }

                // default
                if (d <= repulseRadius) {
                    process();
                }

                // bang - slow motion mode
                // if(!pJS.tmp.repulse_finish){
                //   if(d <= repulseRadius){
                //     process();
                //   }
                // }else{
                //   process();
                // }


            } else {

                if (pJS.tmp.repulse_clicking == false) {

                    p.vx = p.vx_i;
                    p.vy = p.vy_i;

                }

            }

        }

    }


    pJS.fn.modes.grabParticle = function(p) {

        if (pJS.interactivity.events.onhover.enable && pJS.interactivity.status == 'mousemove') {

            var dx_mouse = p.x - pJS.interactivity.mouse.pos_x,
                dy_mouse = p.y - pJS.interactivity.mouse.pos_y,
                dist_mouse = Math.sqrt(dx_mouse * dx_mouse + dy_mouse * dy_mouse);

            /* draw a line between the cursor and the particle if the distance between them is under the config distance */
            if (dist_mouse <= pJS.interactivity.modes.grab.distance) {

                var opacity_line = pJS.interactivity.modes.grab.line_linked.opacity - (dist_mouse / (1 / pJS.interactivity.modes.grab.line_linked.opacity)) / pJS.interactivity.modes.grab.distance;

                if (opacity_line > 0) {

                    /* style */
                    var color_line = pJS.particles.line_linked.color_rgb_line;
                    pJS.canvas.ctx.strokeStyle = 'rgba(' + color_line.r + ',' + color_line.g + ',' + color_line.b + ',' + opacity_line + ')';
                    pJS.canvas.ctx.lineWidth = pJS.particles.line_linked.width;
                    //pJS.canvas.ctx.lineCap = 'round'; /* performance issue */

                    /* path */
                    pJS.canvas.ctx.beginPath();
                    pJS.canvas.ctx.moveTo(p.x, p.y);
                    pJS.canvas.ctx.lineTo(pJS.interactivity.mouse.pos_x, pJS.interactivity.mouse.pos_y);
                    pJS.canvas.ctx.stroke();
                    pJS.canvas.ctx.closePath();

                }

            }

        }

    };



    /* ---------- pJS functions - vendors ------------ */

    pJS.fn.vendors.eventsListeners = function() {

        /* events target element */
        if (pJS.interactivity.detect_on == 'window') {
            pJS.interactivity.el = window;
        } else {
            pJS.interactivity.el = pJS.canvas.el;
        }


        /* detect mouse pos - on hover / click event */
        if (pJS.interactivity.events.onhover.enable || pJS.interactivity.events.onclick.enable) {

            /* el on mousemove */
            pJS.interactivity.el.addEventListener('mousemove', function(e) {

                if (pJS.interactivity.el == window) {
                    var pos_x = e.clientX,
                        pos_y = e.clientY;
                } else {
                    var pos_x = e.offsetX || e.clientX,
                        pos_y = e.offsetY || e.clientY;
                }

                pJS.interactivity.mouse.pos_x = pos_x;
                pJS.interactivity.mouse.pos_y = pos_y;

                if (pJS.tmp.retina) {
                    pJS.interactivity.mouse.pos_x *= pJS.canvas.pxratio;
                    pJS.interactivity.mouse.pos_y *= pJS.canvas.pxratio;
                }

                pJS.interactivity.status = 'mousemove';

            });

            /* el on onmouseleave */
            pJS.interactivity.el.addEventListener('mouseleave', function(e) {

                pJS.interactivity.mouse.pos_x = null;
                pJS.interactivity.mouse.pos_y = null;
                pJS.interactivity.status = 'mouseleave';

            });

        }

        /* on click event */
        if (pJS.interactivity.events.onclick.enable) {

            pJS.interactivity.el.addEventListener('click', function() {

                pJS.interactivity.mouse.click_pos_x = pJS.interactivity.mouse.pos_x;
                pJS.interactivity.mouse.click_pos_y = pJS.interactivity.mouse.pos_y;
                pJS.interactivity.mouse.click_time = new Date().getTime();

                if (pJS.interactivity.events.onclick.enable) {

                    switch (pJS.interactivity.events.onclick.mode) {

                        case 'push':
                            if (pJS.particles.move.enable) {
                                pJS.fn.modes.pushParticles(pJS.interactivity.modes.push.particles_nb, pJS.interactivity.mouse);
                            } else {
                                if (pJS.interactivity.modes.push.particles_nb == 1) {
                                    pJS.fn.modes.pushParticles(pJS.interactivity.modes.push.particles_nb, pJS.interactivity.mouse);
                                } else if (pJS.interactivity.modes.push.particles_nb > 1) {
                                    pJS.fn.modes.pushParticles(pJS.interactivity.modes.push.particles_nb);
                                }
                            }
                            break;

                        case 'remove':
                            pJS.fn.modes.removeParticles(pJS.interactivity.modes.remove.particles_nb);
                            break;

                        case 'bubble':
                            pJS.tmp.bubble_clicking = true;
                            break;

                        case 'repulse':
                            pJS.tmp.repulse_clicking = true;
                            pJS.tmp.repulse_count = 0;
                            pJS.tmp.repulse_finish = false;
                            setTimeout(function() {
                                pJS.tmp.repulse_clicking = false;
                            }, pJS.interactivity.modes.repulse.duration * 1000)
                            break;

                    }

                }

            });

        }


    };

    pJS.fn.vendors.densityAutoParticles = function() {

        if (pJS.particles.number.density.enable) {

            /* calc area */
            var area = pJS.canvas.el.width * pJS.canvas.el.height / 1000;
            if (pJS.tmp.retina) {
                area = area / (pJS.canvas.pxratio * 2);
            }

            /* calc number of particles based on density area */
            var nb_particles = area * pJS.particles.number.value / pJS.particles.number.density.value_area;

            /* add or remove X particles */
            var missing_particles = pJS.particles.array.length - nb_particles;
            if (missing_particles < 0) pJS.fn.modes.pushParticles(Math.abs(missing_particles));
            else pJS.fn.modes.removeParticles(missing_particles);

        }

    };


    pJS.fn.vendors.checkOverlap = function(p1, position) {
        for (var i = 0; i < pJS.particles.array.length; i++) {
            var p2 = pJS.particles.array[i];

            var dx = p1.x - p2.x,
                dy = p1.y - p2.y,
                dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= p1.radius + p2.radius) {
                p1.x = position ? position.x : Math.random() * pJS.canvas.w;
                p1.y = position ? position.y : Math.random() * pJS.canvas.h;
                pJS.fn.vendors.checkOverlap(p1);
            }
        }
    };


    pJS.fn.vendors.createSvgImg = function(p) {

        /* set color to svg element */
        var svgXml = pJS.tmp.source_svg,
            rgbHex = /#([0-9A-F]{3,6})/gi,
            coloredSvgXml = svgXml.replace(rgbHex, function(m, r, g, b) {
                if (p.color.rgb) {
                    var color_value = 'rgba(' + p.color.rgb.r + ',' + p.color.rgb.g + ',' + p.color.rgb.b + ',' + p.opacity + ')';
                } else {
                    var color_value = 'hsla(' + p.color.hsl.h + ',' + p.color.hsl.s + '%,' + p.color.hsl.l + '%,' + p.opacity + ')';
                }
                return color_value;
            });

        /* prepare to create img with colored svg */
        var svg = new Blob([coloredSvgXml], { type: 'image/svg+xml;charset=utf-8' }),
            DOMURL = window.URL || window.webkitURL || window,
            url = DOMURL.createObjectURL(svg);

        /* create particle img obj */
        var img = new Image();
        img.addEventListener('load', function() {
            p.img.obj = img;
            p.img.loaded = true;
            DOMURL.revokeObjectURL(url);
            pJS.tmp.count_svg++;
        });
        img.src = url;

    };


    pJS.fn.vendors.destroypJS = function() {
        cancelAnimationFrame(pJS.fn.drawAnimFrame);
        canvas_el.remove();
        pJSDom = null;
    };


    pJS.fn.vendors.drawShape = function(c, startX, startY, sideLength, sideCountNumerator, sideCountDenominator) {

        // By Programming Thomas - https://programmingthomas.wordpress.com/2013/04/03/n-sided-shapes/
        var sideCount = sideCountNumerator * sideCountDenominator;
        var decimalSides = sideCountNumerator / sideCountDenominator;
        var interiorAngleDegrees = (180 * (decimalSides - 2)) / decimalSides;
        var interiorAngle = Math.PI - Math.PI * interiorAngleDegrees / 180; // convert to radians
        c.save();
        c.beginPath();
        c.translate(startX, startY);
        c.moveTo(0, 0);
        for (var i = 0; i < sideCount; i++) {
            c.lineTo(sideLength, 0);
            c.translate(sideLength, 0);
            c.rotate(interiorAngle);
        }
        //c.stroke();
        c.fill();
        c.restore();

    };

    pJS.fn.vendors.exportImg = function() {
        window.open(pJS.canvas.el.toDataURL('image/png'), '_blank');
    };


    pJS.fn.vendors.loadImg = function(type) {

        pJS.tmp.img_error = undefined;

        if (pJS.particles.shape.image.src != '') {

            if (type == 'svg') {

                var xhr = new XMLHttpRequest();
                xhr.open('GET', pJS.particles.shape.image.src);
                xhr.onreadystatechange = function(data) {
                    if (xhr.readyState == 4) {
                        if (xhr.status == 200) {
                            pJS.tmp.source_svg = data.currentTarget.response;
                            pJS.fn.vendors.checkBeforeDraw();
                        } else {
                            console.log('Error pJS - Image not found');
                            pJS.tmp.img_error = true;
                        }
                    }
                }
                xhr.send();

            } else {

                var img = new Image();
                img.addEventListener('load', function() {
                    pJS.tmp.img_obj = img;
                    pJS.fn.vendors.checkBeforeDraw();
                });
                img.src = pJS.particles.shape.image.src;

            }

        } else {
            console.log('Error pJS - No image.src');
            pJS.tmp.img_error = true;
        }

    };


    pJS.fn.vendors.draw = function() {

        if (pJS.particles.shape.type == 'image') {

            if (pJS.tmp.img_type == 'svg') {

                if (pJS.tmp.count_svg >= pJS.particles.number.value) {
                    pJS.fn.particlesDraw();
                    if (!pJS.particles.move.enable) cancelRequestAnimFrame(pJS.fn.drawAnimFrame);
                    else pJS.fn.drawAnimFrame = requestAnimFrame(pJS.fn.vendors.draw);
                } else {
                    //console.log('still loading...');
                    if (!pJS.tmp.img_error) pJS.fn.drawAnimFrame = requestAnimFrame(pJS.fn.vendors.draw);
                }

            } else {

                if (pJS.tmp.img_obj != undefined) {
                    pJS.fn.particlesDraw();
                    if (!pJS.particles.move.enable) cancelRequestAnimFrame(pJS.fn.drawAnimFrame);
                    else pJS.fn.drawAnimFrame = requestAnimFrame(pJS.fn.vendors.draw);
                } else {
                    if (!pJS.tmp.img_error) pJS.fn.drawAnimFrame = requestAnimFrame(pJS.fn.vendors.draw);
                }

            }

        } else {
            pJS.fn.particlesDraw();
            if (!pJS.particles.move.enable) cancelRequestAnimFrame(pJS.fn.drawAnimFrame);
            else pJS.fn.drawAnimFrame = requestAnimFrame(pJS.fn.vendors.draw);
        }

    };


    pJS.fn.vendors.checkBeforeDraw = function() {

        // if shape is image
        if (pJS.particles.shape.type == 'image') {

            if (pJS.tmp.img_type == 'svg' && pJS.tmp.source_svg == undefined) {
                pJS.tmp.checkAnimFrame = requestAnimFrame(check);
            } else {
                //console.log('images loaded! cancel check');
                cancelRequestAnimFrame(pJS.tmp.checkAnimFrame);
                if (!pJS.tmp.img_error) {
                    pJS.fn.vendors.init();
                    pJS.fn.vendors.draw();
                }

            }

        } else {
            pJS.fn.vendors.init();
            pJS.fn.vendors.draw();
        }

    };


    pJS.fn.vendors.init = function() {

        /* init canvas + particles */
        pJS.fn.retinaInit();
        pJS.fn.canvasInit();
        pJS.fn.canvasSize();
        pJS.fn.canvasPaint();
        pJS.fn.particlesCreate();
        pJS.fn.vendors.densityAutoParticles();

        /* particles.line_linked - convert hex colors to rgb */
        pJS.particles.line_linked.color_rgb_line = hexToRgb(pJS.particles.line_linked.color);

    };


    pJS.fn.vendors.start = function() {

        if (isInArray('image', pJS.particles.shape.type)) {
            pJS.tmp.img_type = pJS.particles.shape.image.src.substr(pJS.particles.shape.image.src.length - 3);
            pJS.fn.vendors.loadImg(pJS.tmp.img_type);
        } else {
            pJS.fn.vendors.checkBeforeDraw();
        }

    };




    /* ---------- pJS - start ------------ */


    pJS.fn.vendors.eventsListeners();

    pJS.fn.vendors.start();



};

/* ---------- global functions - vendors ------------ */

Object.deepExtend = function(destination, source) {
    for (var property in source) {
        if (source[property] && source[property].constructor &&
            source[property].constructor === Object) {
            destination[property] = destination[property] || {};
            arguments.callee(destination[property], source[property]);
        } else {
            destination[property] = source[property];
        }
    }
    return destination;
};

window.requestAnimFrame = (function() {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function(callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

window.cancelRequestAnimFrame = (function() {
    return window.cancelAnimationFrame ||
        window.webkitCancelRequestAnimationFrame ||
        window.mozCancelRequestAnimationFrame ||
        window.oCancelRequestAnimationFrame ||
        window.msCancelRequestAnimationFrame ||
        clearTimeout
})();

function hexToRgb(hex) {
    // By Tim Down - http://stackoverflow.com/a/5624139/3493650
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

function clamp(number, min, max) {
    return Math.min(Math.max(number, min), max);
};

function isInArray(value, array) {
    return array.indexOf(value) > -1;
}


/* ---------- particles.js functions - start ------------ */

window.pJSDom = [];

window.particlesJS = function(tag_id, params) {

    //console.log(params);

    /* no string id? so it's object params, and set the id with default id */
    if (typeof(tag_id) != 'string') {
        params = tag_id;
        tag_id = 'particles-js';
    }

    /* no id? set the id to default id */
    if (!tag_id) {
        tag_id = 'particles-js';
    }

    /* pJS elements */
    var pJS_tag = document.getElementById(tag_id),
        pJS_canvas_class = 'particles-js-canvas-el',
        exist_canvas = pJS_tag.getElementsByClassName(pJS_canvas_class);

    /* remove canvas if exists into the pJS target tag */
    if (exist_canvas.length) {
        while (exist_canvas.length > 0) {
            pJS_tag.removeChild(exist_canvas[0]);
        }
    }

    /* create canvas element */
    var canvas_el = document.createElement('canvas');
    canvas_el.className = pJS_canvas_class;

    /* set size canvas */
    canvas_el.style.width = "100%";
    canvas_el.style.height = "100%";

    /* append canvas */
    var canvas = document.getElementById(tag_id).appendChild(canvas_el);

    /* launch particle.js */
    if (canvas != null) {
        pJSDom.push(new pJS(tag_id, params));
    }

};

window.particlesJS.load = function(tag_id, path_config_json, callback) {

    /* load json config */
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path_config_json);
    xhr.onreadystatechange = function(data) {
        if (xhr.readyState == 4) {
            if (xhr.status == 200) {
                var params = JSON.parse(data.currentTarget.response);
                window.particlesJS(tag_id, params);
                if (callback) callback();
            } else {
                console.log('Error pJS - XMLHttpRequest status: ' + xhr.status);
                console.log('Error pJS - File config not found');
            }
        }
    };
    xhr.send();

};
/*!
 * jQuery.scrollTo
 * Copyright (c) 2007-2015 Ariel Flesler - aflesler â—‹ gmail â€¢ com | http://flesler.blogspot.com
 * Licensed under MIT
 * http://flesler.blogspot.com/2007/10/jqueryscrollto.html
 * @projectDescription Lightweight, cross-browser and highly customizable animated scrolling with jQuery
 * @author Ariel Flesler
 * @version 2.1.2
 */
;
(function(factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['jquery'], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        // CommonJS
        module.exports = factory(require('jquery'));
    } else {
        // Global
        factory(jQuery);
    }
})(function($) {
    'use strict';

    var $scrollTo = $.scrollTo = function(target, duration, settings) {
        return $(window).scrollTo(target, duration, settings);
    };

    $scrollTo.defaults = {
        axis: 'xy',
        duration: 0,
        limit: true
    };

    function isWin(elem) {
        return !elem.nodeName ||
            $.inArray(elem.nodeName.toLowerCase(), ['iframe', '#document', 'html', 'body']) !== -1;
    }

    $.fn.scrollTo = function(target, duration, settings) {
        if (typeof duration === 'object') {
            settings = duration;
            duration = 0;
        }
        if (typeof settings === 'function') {
            settings = { onAfter: settings };
        }
        if (target === 'max') {
            target = 9e9;
        }

        settings = $.extend({}, $scrollTo.defaults, settings);
        // Speed is still recognized for backwards compatibility
        duration = duration || settings.duration;
        // Make sure the settings are given right
        var queue = settings.queue && settings.axis.length > 1;
        if (queue) {
            // Let's keep the overall duration
            duration /= 2;
        }
        settings.offset = both(settings.offset);
        settings.over = both(settings.over);

        return this.each(function() {
            // Null target yields nothing, just like jQuery does
            if (target === null) return;

            var win = isWin(this),
                elem = win ? this.contentWindow || window : this,
                $elem = $(elem),
                targ = target,
                attr = {},
                toff;

            switch (typeof targ) {
                // A number will pass the regex
                case 'number':
                case 'string':
                    if (/^([+-]=?)?\d+(\.\d+)?(px|%)?$/.test(targ)) {
                        targ = both(targ);
                        // We are done
                        break;
                    }
                    // Relative/Absolute selector
                    targ = win ? $(targ) : $(targ, elem);
                    /* falls through */
                case 'object':
                    if (targ.length === 0) return;
                    // DOMElement / jQuery
                    if (targ.is || targ.style) {
                        // Get the real position of the target
                        toff = (targ = $(targ)).offset();
                    }
            }

            var offset = $.isFunction(settings.offset) && settings.offset(elem, targ) || settings.offset;

            $.each(settings.axis.split(''), function(i, axis) {
                var Pos = axis === 'x' ? 'Left' : 'Top',
                    pos = Pos.toLowerCase(),
                    key = 'scroll' + Pos,
                    prev = $elem[key](),
                    max = $scrollTo.max(elem, axis);

                if (toff) { // jQuery / DOMElement
                    attr[key] = toff[pos] + (win ? 0 : prev - $elem.offset()[pos]);

                    // If it's a dom element, reduce the margin
                    if (settings.margin) {
                        attr[key] -= parseInt(targ.css('margin' + Pos), 10) || 0;
                        attr[key] -= parseInt(targ.css('border' + Pos + 'Width'), 10) || 0;
                    }

                    attr[key] += offset[pos] || 0;

                    if (settings.over[pos]) {
                        // Scroll to a fraction of its width/height
                        attr[key] += targ[axis === 'x' ? 'width' : 'height']() * settings.over[pos];
                    }
                } else {
                    var val = targ[pos];
                    // Handle percentage values
                    attr[key] = val.slice && val.slice(-1) === '%' ?
                        parseFloat(val) / 100 * max :
                        val;
                }

                // Number or 'number'
                if (settings.limit && /^\d+$/.test(attr[key])) {
                    // Check the limits
                    attr[key] = attr[key] <= 0 ? 0 : Math.min(attr[key], max);
                }

                // Don't waste time animating, if there's no need.
                if (!i && settings.axis.length > 1) {
                    if (prev === attr[key]) {
                        // No animation needed
                        attr = {};
                    } else if (queue) {
                        // Intermediate animation
                        animate(settings.onAfterFirst);
                        // Don't animate this axis again in the next iteration.
                        attr = {};
                    }
                }
            });

            animate(settings.onAfter);

            function animate(callback) {
                var opts = $.extend({}, settings, {
                    // The queue setting conflicts with animate()
                    // Force it to always be true
                    queue: true,
                    duration: duration,
                    complete: callback && function() {
                        callback.call(elem, targ, settings);
                    }
                });
                $elem.animate(attr, opts);
            }
        });
    };

    // Max scrolling position, works on quirks mode
    // It only fails (not too badly) on IE, quirks mode.
    $scrollTo.max = function(elem, axis) {
        var Dim = axis === 'x' ? 'Width' : 'Height',
            scroll = 'scroll' + Dim;

        if (!isWin(elem))
            return elem[scroll] - $(elem)[Dim.toLowerCase()]();

        var size = 'client' + Dim,
            doc = elem.ownerDocument || elem.document,
            html = doc.documentElement,
            body = doc.body;

        return Math.max(html[scroll], body[scroll]) - Math.min(html[size], body[size]);
    };

    function both(val) {
        return $.isFunction(val) || $.isPlainObject(val) ? val : { top: val, left: val };
    }

    // Add special hooks so that window scroll properties can be animated
    $.Tween.propHooks.scrollLeft =
        $.Tween.propHooks.scrollTop = {
            get: function(t) {
                return $(t.elem)[t.prop]();
            },
            set: function(t) {
                var curr = this.get(t);
                // If interrupt is true and user scrolled, stop animating
                if (t.options.interrupt && t._last && t._last !== curr) {
                    return $(t.elem).stop();
                }
                var next = Math.round(t.now);
                // Don't waste CPU
                // Browsers don't render floating point scroll
                if (curr !== next) {
                    $(t.elem)[t.prop](next);
                    t._last = this.get(t);
                }
            }
        };

    // AMD requirement
    return $scrollTo;
});

/*!
 * imagesLoaded PACKAGED v4.1.1
 * JavaScript is all like "You images are done yet or what?"
 * MIT License
 */

/**
 * EvEmitter v1.0.3
 * Lil' event emitter
 * MIT License
 */

/* jshint unused: true, undef: true, strict: true */

(function(global, factory) {
    // universal module definition
    /* jshint strict: false */
    /* globals define, module, window */
    if (typeof define == 'function' && define.amd) {
        // AMD - RequireJS
        define('ev-emitter/ev-emitter', factory);
    } else if (typeof module == 'object' && module.exports) {
        // CommonJS - Browserify, Webpack
        module.exports = factory();
    } else {
        // Browser globals
        global.EvEmitter = factory();
    }

}(typeof window != 'undefined' ? window : this, function() {



    function EvEmitter() {}

    var proto = EvEmitter.prototype;

    proto.on = function(eventName, listener) {
        if (!eventName || !listener) {
            return;
        }
        // set events hash
        var events = this._events = this._events || {};
        // set listeners array
        var listeners = events[eventName] = events[eventName] || [];
        // only add once
        if (listeners.indexOf(listener) == -1) {
            listeners.push(listener);
        }

        return this;
    };

    proto.once = function(eventName, listener) {
        if (!eventName || !listener) {
            return;
        }
        // add event
        this.on(eventName, listener);
        // set once flag
        // set onceEvents hash
        var onceEvents = this._onceEvents = this._onceEvents || {};
        // set onceListeners object
        var onceListeners = onceEvents[eventName] = onceEvents[eventName] || {};
        // set flag
        onceListeners[listener] = true;

        return this;
    };

    proto.off = function(eventName, listener) {
        var listeners = this._events && this._events[eventName];
        if (!listeners || !listeners.length) {
            return;
        }
        var index = listeners.indexOf(listener);
        if (index != -1) {
            listeners.splice(index, 1);
        }

        return this;
    };

    proto.emitEvent = function(eventName, args) {
        var listeners = this._events && this._events[eventName];
        if (!listeners || !listeners.length) {
            return;
        }
        var i = 0;
        var listener = listeners[i];
        args = args || [];
        // once stuff
        var onceListeners = this._onceEvents && this._onceEvents[eventName];

        while (listener) {
            var isOnce = onceListeners && onceListeners[listener];
            if (isOnce) {
                // remove listener
                // remove before trigger to prevent recursion
                this.off(eventName, listener);
                // unset once flag
                delete onceListeners[listener];
            }
            // trigger listener
            listener.apply(this, args);
            // get next listener
            i += isOnce ? 0 : 1;
            listener = listeners[i];
        }

        return this;
    };

    return EvEmitter;

}));

/*!
 * imagesLoaded v4.1.1
 * JavaScript is all like "You images are done yet or what?"
 * MIT License
 */

(function(window, factory) {
    'use strict';
    // universal module definition

    /*global define: false, module: false, require: false */

    if (typeof define == 'function' && define.amd) {
        // AMD
        define([
            'ev-emitter/ev-emitter'
        ], function(EvEmitter) {
            return factory(window, EvEmitter);
        });
    } else if (typeof module == 'object' && module.exports) {
        // CommonJS
        module.exports = factory(
            window,
            require('ev-emitter')
        );
    } else {
        // browser global
        window.imagesLoaded = factory(
            window,
            window.EvEmitter
        );
    }

})(window,

    // --------------------------  factory -------------------------- //

    function factory(window, EvEmitter) {



        var $ = window.jQuery;
        var console = window.console;

        // -------------------------- helpers -------------------------- //

        // extend objects
        function extend(a, b) {
            for (var prop in b) {
                a[prop] = b[prop];
            }
            return a;
        }

        // turn element or nodeList into an array
        function makeArray(obj) {
            var ary = [];
            if (Array.isArray(obj)) {
                // use object if already an array
                ary = obj;
            } else if (typeof obj.length == 'number') {
                // convert nodeList to array
                for (var i = 0; i < obj.length; i++) {
                    ary.push(obj[i]);
                }
            } else {
                // array of single index
                ary.push(obj);
            }
            return ary;
        }

        // -------------------------- imagesLoaded -------------------------- //

        /**
         * @param {Array, Element, NodeList, String} elem
         * @param {Object or Function} options - if function, use as callback
         * @param {Function} onAlways - callback function
         */
        function ImagesLoaded(elem, options, onAlways) {
            // coerce ImagesLoaded() without new, to be new ImagesLoaded()
            if (!(this instanceof ImagesLoaded)) {
                return new ImagesLoaded(elem, options, onAlways);
            }
            // use elem as selector string
            if (typeof elem == 'string') {
                elem = document.querySelectorAll(elem);
            }

            this.elements = makeArray(elem);
            this.options = extend({}, this.options);

            if (typeof options == 'function') {
                onAlways = options;
            } else {
                extend(this.options, options);
            }

            if (onAlways) {
                this.on('always', onAlways);
            }

            this.getImages();

            if ($) {
                // add jQuery Deferred object
                this.jqDeferred = new $.Deferred();
            }

            // HACK check async to allow time to bind listeners
            setTimeout(function() {
                this.check();
            }.bind(this));
        }

        ImagesLoaded.prototype = Object.create(EvEmitter.prototype);

        ImagesLoaded.prototype.options = {};

        ImagesLoaded.prototype.getImages = function() {
            this.images = [];

            // filter & find items if we have an item selector
            this.elements.forEach(this.addElementImages, this);
        };

        /**
         * @param {Node} element
         */
        ImagesLoaded.prototype.addElementImages = function(elem) {
            // filter siblings
            if (elem.nodeName == 'IMG') {
                this.addImage(elem);
            }
            // get background image on element
            if (this.options.background === true) {
                this.addElementBackgroundImages(elem);
            }

            // find children
            // no non-element nodes, #143
            var nodeType = elem.nodeType;
            if (!nodeType || !elementNodeTypes[nodeType]) {
                return;
            }
            var childImgs = elem.querySelectorAll('img');
            // concat childElems to filterFound array
            for (var i = 0; i < childImgs.length; i++) {
                var img = childImgs[i];
                this.addImage(img);
            }

            // get child background images
            if (typeof this.options.background == 'string') {
                var children = elem.querySelectorAll(this.options.background);
                for (i = 0; i < children.length; i++) {
                    var child = children[i];
                    this.addElementBackgroundImages(child);
                }
            }
        };

        var elementNodeTypes = {
            1: true,
            9: true,
            11: true
        };

        ImagesLoaded.prototype.addElementBackgroundImages = function(elem) {
            var style = getComputedStyle(elem);
            if (!style) {
                // Firefox returns null if in a hidden iframe https://bugzil.la/548397
                return;
            }
            // get url inside url("...")
            var reURL = /url\((['"])?(.*?)\1\)/gi;
            var matches = reURL.exec(style.backgroundImage);
            while (matches !== null) {
                var url = matches && matches[2];
                if (url) {
                    this.addBackground(url, elem);
                }
                matches = reURL.exec(style.backgroundImage);
            }
        };

        /**
         * @param {Image} img
         */
        ImagesLoaded.prototype.addImage = function(img) {
            var loadingImage = new LoadingImage(img);
            this.images.push(loadingImage);
        };

        ImagesLoaded.prototype.addBackground = function(url, elem) {
            var background = new Background(url, elem);
            this.images.push(background);
        };

        ImagesLoaded.prototype.check = function() {
            var _this = this;
            this.progressedCount = 0;
            this.hasAnyBroken = false;
            // complete if no images
            if (!this.images.length) {
                this.complete();
                return;
            }

            function onProgress(image, elem, message) {
                // HACK - Chrome triggers event before object properties have changed. #83
                setTimeout(function() {
                    _this.progress(image, elem, message);
                });
            }

            this.images.forEach(function(loadingImage) {
                loadingImage.once('progress', onProgress);
                loadingImage.check();
            });
        };

        ImagesLoaded.prototype.progress = function(image, elem, message) {
            this.progressedCount++;
            this.hasAnyBroken = this.hasAnyBroken || !image.isLoaded;
            // progress event
            this.emitEvent('progress', [this, image, elem]);
            if (this.jqDeferred && this.jqDeferred.notify) {
                this.jqDeferred.notify(this, image);
            }
            // check if completed
            if (this.progressedCount == this.images.length) {
                this.complete();
            }

            if (this.options.debug && console) {
                console.log('progress: ' + message, image, elem);
            }
        };

        ImagesLoaded.prototype.complete = function() {
            var eventName = this.hasAnyBroken ? 'fail' : 'done';
            this.isComplete = true;
            this.emitEvent(eventName, [this]);
            this.emitEvent('always', [this]);
            if (this.jqDeferred) {
                var jqMethod = this.hasAnyBroken ? 'reject' : 'resolve';
                this.jqDeferred[jqMethod](this);
            }
        };

        // --------------------------  -------------------------- //

        function LoadingImage(img) {
            this.img = img;
        }

        LoadingImage.prototype = Object.create(EvEmitter.prototype);

        LoadingImage.prototype.check = function() {
            // If complete is true and browser supports natural sizes,
            // try to check for image status manually.
            var isComplete = this.getIsImageComplete();
            if (isComplete) {
                // report based on naturalWidth
                this.confirm(this.img.naturalWidth !== 0, 'naturalWidth');
                return;
            }

            // If none of the checks above matched, simulate loading on detached element.
            this.proxyImage = new Image();
            this.proxyImage.addEventListener('load', this);
            this.proxyImage.addEventListener('error', this);
            // bind to image as well for Firefox. #191
            this.img.addEventListener('load', this);
            this.img.addEventListener('error', this);
            this.proxyImage.src = this.img.src;
        };

        LoadingImage.prototype.getIsImageComplete = function() {
            return this.img.complete && this.img.naturalWidth !== undefined;
        };

        LoadingImage.prototype.confirm = function(isLoaded, message) {
            this.isLoaded = isLoaded;
            this.emitEvent('progress', [this, this.img, message]);
        };

        // ----- events ----- //

        // trigger specified handler for event type
        LoadingImage.prototype.handleEvent = function(event) {
            var method = 'on' + event.type;
            if (this[method]) {
                this[method](event);
            }
        };

        LoadingImage.prototype.onload = function() {
            this.confirm(true, 'onload');
            this.unbindEvents();
        };

        LoadingImage.prototype.onerror = function() {
            this.confirm(false, 'onerror');
            this.unbindEvents();
        };

        LoadingImage.prototype.unbindEvents = function() {
            this.proxyImage.removeEventListener('load', this);
            this.proxyImage.removeEventListener('error', this);
            this.img.removeEventListener('load', this);
            this.img.removeEventListener('error', this);
        };

        // -------------------------- Background -------------------------- //

        function Background(url, element) {
            this.url = url;
            this.element = element;
            this.img = new Image();
        }

        // inherit LoadingImage prototype
        Background.prototype = Object.create(LoadingImage.prototype);

        Background.prototype.check = function() {
            this.img.addEventListener('load', this);
            this.img.addEventListener('error', this);
            this.img.src = this.url;
            // check if image is already complete
            var isComplete = this.getIsImageComplete();
            if (isComplete) {
                this.confirm(this.img.naturalWidth !== 0, 'naturalWidth');
                this.unbindEvents();
            }
        };

        Background.prototype.unbindEvents = function() {
            this.img.removeEventListener('load', this);
            this.img.removeEventListener('error', this);
        };

        Background.prototype.confirm = function(isLoaded, message) {
            this.isLoaded = isLoaded;
            this.emitEvent('progress', [this, this.element, message]);
        };

        // -------------------------- jQuery -------------------------- //

        ImagesLoaded.makeJQueryPlugin = function(jQuery) {
            jQuery = jQuery || window.jQuery;
            if (!jQuery) {
                return;
            }
            // set local variable
            $ = jQuery;
            // $().imagesLoaded()
            $.fn.imagesLoaded = function(options, callback) {
                var instance = new ImagesLoaded(this, options, callback);
                return instance.jqDeferred.promise($(this));
            };
        };
        // try making plugin
        ImagesLoaded.makeJQueryPlugin();

        // --------------------------  -------------------------- //

        return ImagesLoaded;

    });


! function(e, t) { "object" == typeof exports && "object" == typeof module ? module.exports = t() : "function" == typeof define && define.amd ? define([], t) : "object" == typeof exports ? exports.AOS = t() : e.AOS = t() }(this, function() {
    return function(e) {
        function t(o) { if (n[o]) return n[o].exports; var i = n[o] = { exports: {}, id: o, loaded: !1 }; return e[o].call(i.exports, i, i.exports, t), i.loaded = !0, i.exports }
        var n = {};
        return t.m = e, t.c = n, t.p = "dist/", t(0)
    }([function(e, t, n) {
        "use strict";

        function o(e) { return e && e.__esModule ? e : { default: e } }
        var i = Object.assign || function(e) { for (var t = 1; t < arguments.length; t++) { var n = arguments[t]; for (var o in n) Object.prototype.hasOwnProperty.call(n, o) && (e[o] = n[o]) } return e },
            r = n(1),
            a = (o(r), n(6)),
            u = o(a),
            c = n(7),
            f = o(c),
            s = n(8),
            d = o(s),
            l = n(9),
            p = o(l),
            m = n(10),
            b = o(m),
            v = n(11),
            y = o(v),
            g = n(14),
            h = o(g),
            w = [],
            k = !1,
            x = { offset: 120, delay: 0, easing: "ease", duration: 400, disable: !1, once: !1, startEvent: "DOMContentLoaded", throttleDelay: 99, debounceDelay: 50, disableMutationObserver: !1 },
            j = function() { var e = arguments.length > 0 && void 0 !== arguments[0] && arguments[0]; if (e && (k = !0), k) return w = (0, y.default)(w, x), (0, b.default)(w, x.once), w },
            O = function() { w = (0, h.default)(), j() },
            _ = function() { w.forEach(function(e, t) { e.node.removeAttribute("data-aos"), e.node.removeAttribute("data-aos-easing"), e.node.removeAttribute("data-aos-duration"), e.node.removeAttribute("data-aos-delay") }) },
            S = function(e) { return e === !0 || "mobile" === e && p.default.mobile() || "phone" === e && p.default.phone() || "tablet" === e && p.default.tablet() || "function" == typeof e && e() === !0 },
            z = function(e) {
                x = i(x, e), w = (0, h.default)();
                var t = document.all && !window.atob;
                return S(x.disable) || t ? _() : (document.querySelector("body").setAttribute("data-aos-easing", x.easing), document.querySelector("body").setAttribute("data-aos-duration", x.duration), document.querySelector("body").setAttribute("data-aos-delay", x.delay), "DOMContentLoaded" === x.startEvent && ["complete", "interactive"].indexOf(document.readyState) > -1 ? j(!0) : "load" === x.startEvent ? window.addEventListener(x.startEvent, function() { j(!0) }) : document.addEventListener(x.startEvent, function() { j(!0) }), window.addEventListener("resize", (0, f.default)(j, x.debounceDelay, !0)), window.addEventListener("orientationchange", (0, f.default)(j, x.debounceDelay, !0)), window.addEventListener("scroll", (0, u.default)(function() {
                    (0, b.default)(w, x.once)
                }, x.throttleDelay)), x.disableMutationObserver || (0, d.default)("[data-aos]", O), w)
            };
        e.exports = { init: z, refresh: j, refreshHard: O }
    }, function(e, t) {}, , , , , function(e, t) {
        (function(t) {
            "use strict";

            function n(e, t, n) {
                function o(t) {
                    var n = b,
                        o = v;
                    return b = v = void 0, k = t, g = e.apply(o, n)
                }

                function r(e) { return k = e, h = setTimeout(s, t), _ ? o(e) : g }

                function a(e) {
                    var n = e - w,
                        o = e - k,
                        i = t - n;
                    return S ? j(i, y - o) : i
                }

                function c(e) {
                    var n = e - w,
                        o = e - k;
                    return void 0 === w || n >= t || n < 0 || S && o >= y
                }

                function s() { var e = O(); return c(e) ? d(e) : void(h = setTimeout(s, a(e))) }

                function d(e) { return h = void 0, z && b ? o(e) : (b = v = void 0, g) }

                function l() { void 0 !== h && clearTimeout(h), k = 0, b = w = v = h = void 0 }

                function p() { return void 0 === h ? g : d(O()) }

                function m() {
                    var e = O(),
                        n = c(e);
                    if (b = arguments, v = this, w = e, n) { if (void 0 === h) return r(w); if (S) return h = setTimeout(s, t), o(w) }
                    return void 0 === h && (h = setTimeout(s, t)), g
                }
                var b, v, y, g, h, w, k = 0,
                    _ = !1,
                    S = !1,
                    z = !0;
                if ("function" != typeof e) throw new TypeError(f);
                return t = u(t) || 0, i(n) && (_ = !!n.leading, S = "maxWait" in n, y = S ? x(u(n.maxWait) || 0, t) : y, z = "trailing" in n ? !!n.trailing : z), m.cancel = l, m.flush = p, m
            }

            function o(e, t, o) {
                var r = !0,
                    a = !0;
                if ("function" != typeof e) throw new TypeError(f);
                return i(o) && (r = "leading" in o ? !!o.leading : r, a = "trailing" in o ? !!o.trailing : a), n(e, t, { leading: r, maxWait: t, trailing: a })
            }

            function i(e) { var t = "undefined" == typeof e ? "undefined" : c(e); return !!e && ("object" == t || "function" == t) }

            function r(e) { return !!e && "object" == ("undefined" == typeof e ? "undefined" : c(e)) }

            function a(e) { return "symbol" == ("undefined" == typeof e ? "undefined" : c(e)) || r(e) && k.call(e) == d }

            function u(e) {
                if ("number" == typeof e) return e;
                if (a(e)) return s;
                if (i(e)) {
                    var t = "function" == typeof e.valueOf ? e.valueOf() : e;
                    e = i(t) ? t + "" : t
                }
                if ("string" != typeof e) return 0 === e ? e : +e;
                e = e.replace(l, "");
                var n = m.test(e);
                return n || b.test(e) ? v(e.slice(2), n ? 2 : 8) : p.test(e) ? s : +e
            }
            var c = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(e) { return typeof e } : function(e) { return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e },
                f = "Expected a function",
                s = NaN,
                d = "[object Symbol]",
                l = /^\s+|\s+$/g,
                p = /^[-+]0x[0-9a-f]+$/i,
                m = /^0b[01]+$/i,
                b = /^0o[0-7]+$/i,
                v = parseInt,
                y = "object" == ("undefined" == typeof t ? "undefined" : c(t)) && t && t.Object === Object && t,
                g = "object" == ("undefined" == typeof self ? "undefined" : c(self)) && self && self.Object === Object && self,
                h = y || g || Function("return this")(),
                w = Object.prototype,
                k = w.toString,
                x = Math.max,
                j = Math.min,
                O = function() { return h.Date.now() };
            e.exports = o
        }).call(t, function() { return this }())
    }, function(e, t) {
        (function(t) {
            "use strict";

            function n(e, t, n) {
                function i(t) {
                    var n = b,
                        o = v;
                    return b = v = void 0, O = t, g = e.apply(o, n)
                }

                function r(e) { return O = e, h = setTimeout(s, t), _ ? i(e) : g }

                function u(e) {
                    var n = e - w,
                        o = e - O,
                        i = t - n;
                    return S ? x(i, y - o) : i
                }

                function f(e) {
                    var n = e - w,
                        o = e - O;
                    return void 0 === w || n >= t || n < 0 || S && o >= y
                }

                function s() { var e = j(); return f(e) ? d(e) : void(h = setTimeout(s, u(e))) }

                function d(e) { return h = void 0, z && b ? i(e) : (b = v = void 0, g) }

                function l() { void 0 !== h && clearTimeout(h), O = 0, b = w = v = h = void 0 }

                function p() { return void 0 === h ? g : d(j()) }

                function m() {
                    var e = j(),
                        n = f(e);
                    if (b = arguments, v = this, w = e, n) { if (void 0 === h) return r(w); if (S) return h = setTimeout(s, t), i(w) }
                    return void 0 === h && (h = setTimeout(s, t)), g
                }
                var b, v, y, g, h, w, O = 0,
                    _ = !1,
                    S = !1,
                    z = !0;
                if ("function" != typeof e) throw new TypeError(c);
                return t = a(t) || 0, o(n) && (_ = !!n.leading, S = "maxWait" in n, y = S ? k(a(n.maxWait) || 0, t) : y, z = "trailing" in n ? !!n.trailing : z), m.cancel = l, m.flush = p, m
            }

            function o(e) { var t = "undefined" == typeof e ? "undefined" : u(e); return !!e && ("object" == t || "function" == t) }

            function i(e) { return !!e && "object" == ("undefined" == typeof e ? "undefined" : u(e)) }

            function r(e) { return "symbol" == ("undefined" == typeof e ? "undefined" : u(e)) || i(e) && w.call(e) == s }

            function a(e) {
                if ("number" == typeof e) return e;
                if (r(e)) return f;
                if (o(e)) {
                    var t = "function" == typeof e.valueOf ? e.valueOf() : e;
                    e = o(t) ? t + "" : t
                }
                if ("string" != typeof e) return 0 === e ? e : +e;
                e = e.replace(d, "");
                var n = p.test(e);
                return n || m.test(e) ? b(e.slice(2), n ? 2 : 8) : l.test(e) ? f : +e
            }
            var u = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(e) { return typeof e } : function(e) { return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e },
                c = "Expected a function",
                f = NaN,
                s = "[object Symbol]",
                d = /^\s+|\s+$/g,
                l = /^[-+]0x[0-9a-f]+$/i,
                p = /^0b[01]+$/i,
                m = /^0o[0-7]+$/i,
                b = parseInt,
                v = "object" == ("undefined" == typeof t ? "undefined" : u(t)) && t && t.Object === Object && t,
                y = "object" == ("undefined" == typeof self ? "undefined" : u(self)) && self && self.Object === Object && self,
                g = v || y || Function("return this")(),
                h = Object.prototype,
                w = h.toString,
                k = Math.max,
                x = Math.min,
                j = function() { return g.Date.now() };
            e.exports = n
        }).call(t, function() { return this }())
    }, function(e, t) {
        "use strict";

        function n(e, t) {
            var n = window.document,
                r = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver,
                a = new r(o);
            i = t, a.observe(n.documentElement, { childList: !0, subtree: !0, removedNodes: !0 })
        }

        function o(e) {
            e && e.forEach(function(e) {
                var t = Array.prototype.slice.call(e.addedNodes),
                    n = Array.prototype.slice.call(e.removedNodes),
                    o = t.concat(n).filter(function(e) { return e.hasAttribute && e.hasAttribute("data-aos") }).length;
                o && i()
            })
        }
        Object.defineProperty(t, "__esModule", { value: !0 });
        var i = function() {};
        t.default = n
    }, function(e, t) {
        "use strict";

        function n(e, t) { if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function") }

        function o() { return navigator.userAgent || navigator.vendor || window.opera || "" }
        Object.defineProperty(t, "__esModule", { value: !0 });
        var i = function() {
                function e(e, t) {
                    for (var n = 0; n < t.length; n++) {
                        var o = t[n];
                        o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, o.key, o)
                    }
                }
                return function(t, n, o) { return n && e(t.prototype, n), o && e(t, o), t }
            }(),
            r = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i,
            a = /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i,
            u = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i,
            c = /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i,
            f = function() {
                function e() { n(this, e) }
                return i(e, [{ key: "phone", value: function() { var e = o(); return !(!r.test(e) && !a.test(e.substr(0, 4))) } }, { key: "mobile", value: function() { var e = o(); return !(!u.test(e) && !c.test(e.substr(0, 4))) } }, { key: "tablet", value: function() { return this.mobile() && !this.phone() } }]), e
            }();
        t.default = new f
    }, function(e, t) {
        "use strict";
        Object.defineProperty(t, "__esModule", { value: !0 });
        var n = function(e, t, n) {
                var o = e.node.getAttribute("data-aos-once");
                t > e.position ? e.node.classList.add("aos-animate") : "undefined" != typeof o && ("false" === o || !n && "true" !== o) && e.node.classList.remove("aos-animate")
            },
            o = function(e, t) {
                var o = window.pageYOffset,
                    i = window.innerHeight;
                e.forEach(function(e, r) { n(e, i + o, t) })
            };
        t.default = o
    }, function(e, t, n) {
        "use strict";

        function o(e) { return e && e.__esModule ? e : { default: e } }
        Object.defineProperty(t, "__esModule", { value: !0 });
        var i = n(12),
            r = o(i),
            a = function(e, t) { return e.forEach(function(e, n) { e.node.classList.add("aos-init"), e.position = (0, r.default)(e.node, t.offset) }), e };
        t.default = a
    }, function(e, t, n) {
        "use strict";

        function o(e) { return e && e.__esModule ? e : { default: e } }
        Object.defineProperty(t, "__esModule", { value: !0 });
        var i = n(13),
            r = o(i),
            a = function(e, t) {
                var n = 0,
                    o = 0,
                    i = window.innerHeight,
                    a = { offset: e.getAttribute("data-aos-offset"), anchor: e.getAttribute("data-aos-anchor"), anchorPlacement: e.getAttribute("data-aos-anchor-placement") };
                switch (a.offset && !isNaN(a.offset) && (o = parseInt(a.offset)), a.anchor && document.querySelectorAll(a.anchor) && (e = document.querySelectorAll(a.anchor)[0]), n = (0, r.default)(e).top, a.anchorPlacement) {
                    case "top-bottom":
                        break;
                    case "center-bottom":
                        n += e.offsetHeight / 2;
                        break;
                    case "bottom-bottom":
                        n += e.offsetHeight;
                        break;
                    case "top-center":
                        n += i / 2;
                        break;
                    case "bottom-center":
                        n += i / 2 + e.offsetHeight;
                        break;
                    case "center-center":
                        n += i / 2 + e.offsetHeight / 2;
                        break;
                    case "top-top":
                        n += i;
                        break;
                    case "bottom-top":
                        n += e.offsetHeight + i;
                        break;
                    case "center-top":
                        n += e.offsetHeight / 2 + i
                }
                return a.anchorPlacement || a.offset || isNaN(t) || (o = t), n + o
            };
        t.default = a
    }, function(e, t) {
        "use strict";
        Object.defineProperty(t, "__esModule", { value: !0 });
        var n = function(e) { for (var t = 0, n = 0; e && !isNaN(e.offsetLeft) && !isNaN(e.offsetTop);) t += e.offsetLeft - ("BODY" != e.tagName ? e.scrollLeft : 0), n += e.offsetTop - ("BODY" != e.tagName ? e.scrollTop : 0), e = e.offsetParent; return { top: n, left: t } };
        t.default = n
    }, function(e, t) {
        "use strict";
        Object.defineProperty(t, "__esModule", { value: !0 });
        var n = function(e) { return e = e || document.querySelectorAll("[data-aos]"), Array.prototype.map.call(e, function(e) { return { node: e } }) };
        t.default = n
    }])
});
//============================================================
//
// The MIT License
//
// Copyright (C) 2014 Matthew Wagerfield - @wagerfield
//
// Permission is hereby granted, free of charge, to any
// person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the
// Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do
// so, subject to the following conditions:
//
// The above copyright notice and this permission notice
// shall be included in all copies or substantial portions
// of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
// LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
// EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
// FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
// AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
// OR OTHER DEALINGS IN THE SOFTWARE.
//
//============================================================

/**
 * jQuery || Zepto Parallax Plugin
 * @author Matthew Wagerfield - @wagerfield
 * @description Creates a parallax effect between an array of layers,
 *              driving the motion from the gyroscope output of a smartdevice.
 *              If no gyroscope is available, the cursor position is used.
 */
;
(function($, window, document, undefined) {

    // Strict Mode
    'use strict';

    // Constants
    var NAME = 'parallax';
    var MAGIC_NUMBER = 30;
    var DEFAULTS = {
        relativeInput: false,
        clipRelativeInput: false,
        calibrationThreshold: 100,
        calibrationDelay: 500,
        supportDelay: 500,
        calibrateX: false,
        calibrateY: true,
        invertX: true,
        invertY: true,
        limitX: false,
        limitY: false,
        scalarX: 10.0,
        scalarY: 10.0,
        frictionX: 0.1,
        frictionY: 0.1,
        originX: 0.5,
        originY: 0.5,
        pointerEvents: true,
        precision: 1
    };

    function Plugin(element, options) {

        // DOM Context
        this.element = element;

        // Selections
        this.$context = $(element).data('api', this);
        this.$layers = this.$context.find('.layer');

        // Data Extraction
        var data = {
            calibrateX: this.$context.data('calibrate-x') || null,
            calibrateY: this.$context.data('calibrate-y') || null,
            invertX: this.$context.data('invert-x') || null,
            invertY: this.$context.data('invert-y') || null,
            limitX: parseFloat(this.$context.data('limit-x')) || null,
            limitY: parseFloat(this.$context.data('limit-y')) || null,
            scalarX: parseFloat(this.$context.data('scalar-x')) || null,
            scalarY: parseFloat(this.$context.data('scalar-y')) || null,
            frictionX: parseFloat(this.$context.data('friction-x')) || null,
            frictionY: parseFloat(this.$context.data('friction-y')) || null,
            originX: parseFloat(this.$context.data('origin-x')) || null,
            originY: parseFloat(this.$context.data('origin-y')) || null,
            pointerEvents: this.$context.data('pointer-events') || true,
            precision: parseFloat(this.$context.data('precision')) || 1
        };

        // Delete Null Data Values
        for (var key in data) {
            if (data[key] === null) delete data[key];
        }

        // Compose Settings Object
        $.extend(this, DEFAULTS, options, data);

        // States
        this.calibrationTimer = null;
        this.calibrationFlag = true;
        this.enabled = false;
        this.depthsX = [];
        this.depthsY = [];
        this.raf = null;

        // Element Bounds
        this.bounds = null;
        this.ex = 0;
        this.ey = 0;
        this.ew = 0;
        this.eh = 0;

        // Element Center
        this.ecx = 0;
        this.ecy = 0;

        // Element Range
        this.erx = 0;
        this.ery = 0;

        // Calibration
        this.cx = 0;
        this.cy = 0;

        // Input
        this.ix = 0;
        this.iy = 0;

        // Motion
        this.mx = 0;
        this.my = 0;

        // Velocity
        this.vx = 0;
        this.vy = 0;

        // Callbacks
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onDeviceOrientation = this.onDeviceOrientation.bind(this);
        this.onOrientationTimer = this.onOrientationTimer.bind(this);
        this.onCalibrationTimer = this.onCalibrationTimer.bind(this);
        this.onAnimationFrame = this.onAnimationFrame.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);

        // Initialise
        this.initialise();
    }

    Plugin.prototype.transformSupport = function(value) {
        var element = document.createElement('div');
        var propertySupport = false;
        var propertyValue = null;
        var featureSupport = false;
        var cssProperty = null;
        var jsProperty = null;
        for (var i = 0, l = this.vendors.length; i < l; i++) {
            if (this.vendors[i] !== null) {
                cssProperty = this.vendors[i][0] + 'transform';
                jsProperty = this.vendors[i][1] + 'Transform';
            } else {
                cssProperty = 'transform';
                jsProperty = 'transform';
            }
            if (element.style[jsProperty] !== undefined) {
                propertySupport = true;
                break;
            }
        }
        switch (value) {
            case '2D':
                featureSupport = propertySupport;
                break;
            case '3D':
                if (propertySupport) {
                    var body = document.body || document.createElement('body');
                    var documentElement = document.documentElement;
                    var documentOverflow = documentElement.style.overflow;
                    var isCreatedBody = false;
                    if (!document.body) {
                        isCreatedBody = true;
                        documentElement.style.overflow = 'hidden';
                        documentElement.appendChild(body);
                        body.style.overflow = 'hidden';
                        body.style.background = '';
                    }
                    body.appendChild(element);
                    element.style[jsProperty] = 'translate3d(1px,1px,1px)';
                    propertyValue = window.getComputedStyle(element).getPropertyValue(cssProperty);
                    featureSupport = propertyValue !== undefined && propertyValue.length > 0 && propertyValue !== "none";
                    documentElement.style.overflow = documentOverflow;
                    body.removeChild(element);
                    if (isCreatedBody) {
                        body.removeAttribute('style');
                        body.parentNode.removeChild(body);
                    }
                }
                break;
        }
        return featureSupport;
    };

    Plugin.prototype.ww = null;
    Plugin.prototype.wh = null;
    Plugin.prototype.wcx = null;
    Plugin.prototype.wcy = null;
    Plugin.prototype.wrx = null;
    Plugin.prototype.wry = null;
    Plugin.prototype.portrait = null;
    Plugin.prototype.desktop = !navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry|BB10|mobi|tablet|opera mini|nexus 7)/i);
    Plugin.prototype.vendors = [null, ['-webkit-', 'webkit'],
        ['-moz-', 'Moz'],
        ['-o-', 'O'],
        ['-ms-', 'ms']
    ];
    Plugin.prototype.motionSupport = !!window.DeviceMotionEvent;
    Plugin.prototype.orientationSupport = !!window.DeviceOrientationEvent;
    Plugin.prototype.orientationStatus = 0;
    Plugin.prototype.transform2DSupport = Plugin.prototype.transformSupport('2D');
    Plugin.prototype.transform3DSupport = Plugin.prototype.transformSupport('3D');
    Plugin.prototype.propertyCache = {};

    Plugin.prototype.initialise = function() {

        // Configure Styles
        if (this.$context.css('position') === 'static') {
            this.$context.css({
                position: 'relative'
            });
        }

        // Pointer events
        if (!this.pointerEvents) {
            this.$context.css({
                pointerEvents: 'none'
            });
        }

        // Hardware Accelerate Context
        this.accelerate(this.$context);

        // Setup
        this.updateLayers();
        this.updateDimensions();
        this.enable();
        this.queueCalibration(this.calibrationDelay);
    };

    Plugin.prototype.updateLayers = function() {

        // Cache Layer Elements
        this.$layers = this.$context.find('.layer');
        this.depthsX = [];
        this.depthsY = [];

        // Configure Layer Styles
        this.$layers.css({
            position: 'absolute',
            display: 'block',
            left: 0,
            top: 0
        });
        this.$layers.first().css({
            position: 'relative'
        });

        // Hardware Accelerate Layers
        this.accelerate(this.$layers);

        // Cache Depths
        this.$layers.each($.proxy(function(index, element) {
            //Graceful fallback on depth if depth-x or depth-y is absent
            var depth = $(element).data('depth') || 0;
            this.depthsX.push($(element).data('depth-x') || depth);
            this.depthsY.push($(element).data('depth-y') || depth);
        }, this));
    };

    Plugin.prototype.updateDimensions = function() {
        this.ww = window.innerWidth;
        this.wh = window.innerHeight;
        this.wcx = this.ww * this.originX;
        this.wcy = this.wh * this.originY;
        this.wrx = Math.max(this.wcx, this.ww - this.wcx);
        this.wry = Math.max(this.wcy, this.wh - this.wcy);
    };

    Plugin.prototype.updateBounds = function() {
        this.bounds = this.element.getBoundingClientRect();
        this.ex = this.bounds.left;
        this.ey = this.bounds.top;
        this.ew = this.bounds.width;
        this.eh = this.bounds.height;
        this.ecx = this.ew * this.originX;
        this.ecy = this.eh * this.originY;
        this.erx = Math.max(this.ecx, this.ew - this.ecx);
        this.ery = Math.max(this.ecy, this.eh - this.ecy);
    };

    Plugin.prototype.queueCalibration = function(delay) {
        clearTimeout(this.calibrationTimer);
        this.calibrationTimer = setTimeout(this.onCalibrationTimer, delay);
    };

    Plugin.prototype.enable = function() {
        if (!this.enabled) {
            this.enabled = true;
            if (this.orientationSupport) {
                this.portrait = null;
                window.addEventListener('deviceorientation', this.onDeviceOrientation);
                setTimeout(this.onOrientationTimer, this.supportDelay);
            } else {
                this.cx = 0;
                this.cy = 0;
                this.portrait = false;
                window.addEventListener('mousemove', this.onMouseMove);
            }
            window.addEventListener('resize', this.onWindowResize);
            this.raf = requestAnimationFrame(this.onAnimationFrame);
        }
    };

    Plugin.prototype.disable = function() {
        if (this.enabled) {
            this.enabled = false;
            if (this.orientationSupport) {
                window.removeEventListener('deviceorientation', this.onDeviceOrientation);
            } else {
                window.removeEventListener('mousemove', this.onMouseMove);
            }
            window.removeEventListener('resize', this.onWindowResize);
            cancelAnimationFrame(this.raf);
        }
    };

    Plugin.prototype.calibrate = function(x, y) {
        this.calibrateX = x === undefined ? this.calibrateX : x;
        this.calibrateY = y === undefined ? this.calibrateY : y;
    };

    Plugin.prototype.invert = function(x, y) {
        this.invertX = x === undefined ? this.invertX : x;
        this.invertY = y === undefined ? this.invertY : y;
    };

    Plugin.prototype.friction = function(x, y) {
        this.frictionX = x === undefined ? this.frictionX : x;
        this.frictionY = y === undefined ? this.frictionY : y;
    };

    Plugin.prototype.scalar = function(x, y) {
        this.scalarX = x === undefined ? this.scalarX : x;
        this.scalarY = y === undefined ? this.scalarY : y;
    };

    Plugin.prototype.limit = function(x, y) {
        this.limitX = x === undefined ? this.limitX : x;
        this.limitY = y === undefined ? this.limitY : y;
    };

    Plugin.prototype.origin = function(x, y) {
        this.originX = x === undefined ? this.originX : x;
        this.originY = y === undefined ? this.originY : y;
    };

    Plugin.prototype.clamp = function(value, min, max) {
        value = Math.max(value, min);
        value = Math.min(value, max);
        return value;
    };

    Plugin.prototype.css = function(element, property, value) {
        var jsProperty = this.propertyCache[property];
        if (!jsProperty) {
            for (var i = 0, l = this.vendors.length; i < l; i++) {
                if (this.vendors[i] !== null) {
                    jsProperty = $.camelCase(this.vendors[i][1] + '-' + property);
                } else {
                    jsProperty = property;
                }
                if (element.style[jsProperty] !== undefined) {
                    this.propertyCache[property] = jsProperty;
                    break;
                }
            }
        }
        element.style[jsProperty] = value;
    };

    Plugin.prototype.accelerate = function($element) {
        for (var i = 0, l = $element.length; i < l; i++) {
            var element = $element[i];
            this.css(element, 'transform', 'translate3d(0,0,0)');
            this.css(element, 'transform-style', 'preserve-3d');
            this.css(element, 'backface-visibility', 'hidden');
        }
    };

    Plugin.prototype.setPosition = function(element, x, y) {
        x += 'px';
        y += 'px';
        if (this.transform3DSupport) {
            this.css(element, 'transform', 'translate3d(' + x + ',' + y + ',0)');
        } else if (this.transform2DSupport) {
            this.css(element, 'transform', 'translate(' + x + ',' + y + ')');
        } else {
            element.style.left = x;
            element.style.top = y;
        }
    };

    Plugin.prototype.onOrientationTimer = function(event) {
        if (this.orientationSupport && this.orientationStatus === 0) {
            this.disable();
            this.orientationSupport = false;
            this.enable();
        }
    };

    Plugin.prototype.onCalibrationTimer = function(event) {
        this.calibrationFlag = true;
    };

    Plugin.prototype.onWindowResize = function(event) {
        this.updateDimensions();
    };

    Plugin.prototype.onAnimationFrame = function() {
        this.updateBounds();
        var dx = this.ix - this.cx;
        var dy = this.iy - this.cy;
        if ((Math.abs(dx) > this.calibrationThreshold) || (Math.abs(dy) > this.calibrationThreshold)) {
            this.queueCalibration(0);
        }
        if (this.portrait) {
            this.mx = this.calibrateX ? dy : this.iy;
            this.my = this.calibrateY ? dx : this.ix;
        } else {
            this.mx = this.calibrateX ? dx : this.ix;
            this.my = this.calibrateY ? dy : this.iy;
        }
        this.mx *= this.ew * (this.scalarX / 100);
        this.my *= this.eh * (this.scalarY / 100);
        if (!isNaN(parseFloat(this.limitX))) {
            this.mx = this.clamp(this.mx, -this.limitX, this.limitX);
        }
        if (!isNaN(parseFloat(this.limitY))) {
            this.my = this.clamp(this.my, -this.limitY, this.limitY);
        }
        this.vx += (this.mx - this.vx) * this.frictionX;
        this.vy += (this.my - this.vy) * this.frictionY;
        for (var i = 0, l = this.$layers.length; i < l; i++) {
            var depthX = this.depthsX[i];
            var depthY = this.depthsY[i];
            var layer = this.$layers[i];
            var xOffset = this.vx * (depthX * (this.invertX ? -1 : 1));
            var yOffset = this.vy * (depthY * (this.invertY ? -1 : 1));
            this.setPosition(layer, xOffset, yOffset);
        }
        this.raf = requestAnimationFrame(this.onAnimationFrame);
    };

    Plugin.prototype.onDeviceOrientation = function(event) {

        // Validate environment and event properties.
        if (!this.desktop && event.beta !== null && event.gamma !== null) {

            // Set orientation status.
            this.orientationStatus = 1;

            // Extract Rotation
            var x = (event.beta || 0) / MAGIC_NUMBER; //  -90 :: 90
            var y = (event.gamma || 0) / MAGIC_NUMBER; // -180 :: 180

            // Detect Orientation Change
            var portrait = window.innerHeight > window.innerWidth;
            if (this.portrait !== portrait) {
                this.portrait = portrait;
                this.calibrationFlag = true;
            }

            // Set Calibration
            if (this.calibrationFlag) {
                this.calibrationFlag = false;
                this.cx = x;
                this.cy = y;
            }

            // Set Input
            this.ix = x;
            this.iy = y;
        }
    };

    Plugin.prototype.onMouseMove = function(event) {

        // Cache mouse coordinates.
        var clientX = event.clientX;
        var clientY = event.clientY;

        // Calculate Mouse Input
        if (!this.orientationSupport && this.relativeInput) {

            // Clip mouse coordinates inside element bounds.
            if (this.clipRelativeInput) {
                clientX = Math.max(clientX, this.ex);
                clientX = Math.min(clientX, this.ex + this.ew);
                clientY = Math.max(clientY, this.ey);
                clientY = Math.min(clientY, this.ey + this.eh);
            }

            // Calculate input relative to the element.
            this.ix = (clientX - this.ex - this.ecx) / this.erx;
            this.iy = (clientY - this.ey - this.ecy) / this.ery;

        } else {

            // Calculate input relative to the window.
            this.ix = (clientX - this.wcx) / this.wrx;
            this.iy = (clientY - this.wcy) / this.wry;
        }
    };

    var API = {
        enable: Plugin.prototype.enable,
        disable: Plugin.prototype.disable,
        updateLayers: Plugin.prototype.updateLayers,
        calibrate: Plugin.prototype.calibrate,
        friction: Plugin.prototype.friction,
        invert: Plugin.prototype.invert,
        scalar: Plugin.prototype.scalar,
        limit: Plugin.prototype.limit,
        origin: Plugin.prototype.origin
    };

    $.fn[NAME] = function(value) {
        var args = arguments;
        return this.each(function() {
            var $this = $(this);
            var plugin = $this.data(NAME);
            if (!plugin) {
                plugin = new Plugin(this, value);
                $this.data(NAME, plugin);
            }
            if (API[value]) {
                plugin[value].apply(plugin, Array.prototype.slice.call(args, 1));
            }
        });
    };

})(window.jQuery || window.Zepto, window, document);

/**
 * Request Animation Frame Polyfill.
 * @author Tino Zijdel
 * @author Paul Irish
 * @see https://gist.github.com/paulirish/1579671
 */
;
(function() {

    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];

    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
                timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if (!window.cancelAnimationFrame) {
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
    }

}());

var scrollEnabled = true;

jQuery(document).ready(function($) {
    $('.open-modal').click(function(e) {
        e.preventDefault();
        var elem = $(this);
        var target = elem.attr('href');

        $(target).addClass('opened');
    });

    $('.close-modal').click(function(e) {
        e.preventDefault();
        closeModal();
    });

    $('.modal-wrapper').click(function(e) {
        $(this).removeClass('opened');
    })
    $('.modal-content').click(function(e) {
        e.stopPropagation();
    });
    $(document).on('click', '.menu-mobile', function(event) {
        event.preventDefault();
        $('body').toggleClass('menu-opened');
    });

    $('.item-tooltip').tooltipster({
        contentCloning: true,
        plugins: ['follower'],
        delay: 0
    });
    $('.slide-item').imagesLoaded(function() {
        $('.slide-item').owlCarousel({
            center: true,
            items: 1,
            dot: true,
            nav: false,
            autoHeight: true,
            animateOut: 'fadeOut'
        });
    })
    setTimeout(function() {
        $('.section-2').find('[data-aos]').removeClass('aos-animate')
    }, 1500)

    $('.loading').addClass('active');
    $('body').addClass('loading-body');

    setTimeout(function() {
        $('.loading').remove();
        $('body').removeClass('loading-body');
        $('.section-1').addClass('animate-in');
        AOS.init({
            easing: 'ease-out-back',
            duration: 1500,
            offset: -20
        });
    }, 1500)

    /*var videoBg = new nc.ui.Player({
      selector: "#bg-video-init",
      videoId: "/images/Background-Clip.mp4",
      mute: !1,
      autoPlay: !1,
      loop: 1
    })*/
    var videoBg = document.getElementById("myVideo");

    $('#wrapper').on('DOMMouseScroll mousewheel', function(event) {
        event.stopPropagation()
        var currentSection = $('.animate-in');

        if ($(window).width() <= 1024 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))
            return

        if (currentSection.hasClass('section-13')) {
            $('.mouse-scroll').hide();
        } else {
            $('.mouse-scroll').show();
        }
        if (currentSection.hasClass('section-2')) {
            //videoBg.play();
        } else {
            //videoBg.pause();
        }

        if (!scrollEnabled)
            return;

        var target;

        var leafType, directionType, leafTimeout;

        if (event.originalEvent.detail > 0 || event.originalEvent.wheelDelta < 0) {
            if (currentSection.next().hasClass('section')) {
                currentSection.next().removeClass('animate-out').addClass('animate-in');
                currentSection.addClass('animate-out').removeClass('animate-in');
                target = currentSection.next().data('class');

                $('.section').find('[data-aos]').removeClass('aos-animate')
                $(target).find('[data-aos]').addClass('aos-animate')
                currentSection.find('[data-aos]').removeClass('aos-animate')

                $('.section').find('#petal-stage-wrap').remove()
                $(target).prepend('<div id="petal-stage-wrap" class="petal-stage-wrap"><div id="petal-stage" class="petal-stage"></div></div>');
                leafType = $(target).data('leaf')
                directionType = $(target).data('direction')
            }
        } else {
            if (currentSection.prev().hasClass('section')) {
                currentSection.prev().removeClass('animate-out').addClass('animate-in');
                currentSection.addClass('animate-out').removeClass('animate-in');
                target = currentSection.prev().data('class');

                $('.section').find('[data-aos]').removeClass('aos-animate')
                $(target).find('[data-aos]').addClass('aos-animate')

                $('.section').find('#petal-stage-wrap').remove()
                $(target).prepend('<div id="petal-stage-wrap" class="petal-stage-wrap"><div id="petal-stage" class="petal-stage"></div></div>');
                leafType = $(target).data('leaf')
                directionType = $(target).data('direction')
            }
        }

        $('#fixed-nav').find('a').removeClass('active');
        var target = $('.animate-in').data('target');
        $(target).addClass('active');

        disableScroll();
        return false;
    });

    if ($('.parallax-scene').length) {
        $('.parallax-scene').parallax();
    }

    $('#fixed-nav').find('a').click(function(event) {
        var elem = $(this);
        var target = elem.data('target');

        if ($(target).length) {
            event.preventDefault();

            $('.section').find('[data-aos]').removeClass('aos-animate')
            $(target).find('[data-aos]').addClass('aos-animate')

            if ($(target).hasClass('section-2')) {
                videoBg.play();
            } else {
                videoBg.pause();
            }

            $('#fixed-nav').find('a').removeClass('active');
            elem.addClass('active')
            $('.section').removeClass('animate-in').addClass('animate-out');
            $(target).removeClass('animate-out').addClass('animate-in');
        }
    });
    timerCountdown()
    $(window).trigger('resize')
});

$(document).on('keyup', function(e) {
    if (e.which == 27) {
        closeModal();
    }
})

function closeModal() {
    $('.modal-wrapper').removeClass('opened');
}

$(window).resize(function(event) {
    if ($(window).width() > 1024 && !$('#petal-stage-wrap').length) {
        /*setTimeout(function() {
          $('#header .container').before('<div id="petal-stage-wrap" class="petal-stage-wrap"><div id="petal-stage" class="petal-stage"></div></div>');
          blossom('leaf-1', 'left');

          $('#header').append('<div class="ani_wrap"> <div class="flame_wrap"> </div> </div>');
          flame();
        }, 2000)*/
    } else {
        $('#petal-stage-wrap').remove();
    }
    if ($(window).width() < 1200) {
        $('body').addClass('mobile');
    } else {
        $('body').removeClass('mobile');
    }
    if ($('#myVideo').length) {
        var resolution = 16 / 9;
        var window_with = $(window).width();
        var window_height = $(window).height();

        if (window_with > window_height * resolution) {
            $("#myVideo").css({
                width: window_with,
                height: window_with / resolution,
                "margin-top": (window_with / resolution - window_height) / 2 * -1,
                "margin-left": 0,
                "z-index": -1
            })
        } else {
            $("#myVideo").css({
                width: window_height * resolution,
                height: window_height,
                "margin-top": 0,
                "margin-left": (window_height * resolution - window_with) / 2 * -1,
                "z-index": -1
            })
        }
    }

});

function activeNavigation(target) {
    $('.wrap-bullets').find('a').removeClass('active');

    switch (target) {
        case '.section-2':
            $('.bullet-1').addClass('active')
            break;
        case '.section-3':
            $('.bullet-2').addClass('active')
            break;
        case '.section-4':
            $('.bullet-3').addClass('active')
            break;
        case '.section-5':
            $('.bullet-4').addClass('active')
            break;
        default:

    }
}

function flame() {
    var flame = $('.flame_wrap').find('.flame');
    if (flame.length <= 0) {
        var index = 60;
        for (i = 0; i <= index; i++) {
            $('.flame_wrap').append('<div class="flame flame_' + i + '"></div>');
        }
    }
}

function blossom(type, direction) {
    var stageWrap = document.getElementById('petal-stage-wrap');
    var stage = document.getElementById('petal-stage');
    var stageWidth = stageWrap.clientWidth;
    var stageHeight = stageWrap.clientHeight;
    var petalNum = 40;
    var petalObjArr = [];
    var g = 0.00002;
    var w = 0;
    var wDeg = 0;
    var fps = 60;
    var frameTime = 1000 / fps;

    var getRandomInt = function(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    };

    var getDegree = function(radian) {
        return radian / Math.PI * 180;
    };

    var getRadian = function(degrees) {
        return degrees * Math.PI / 240;
    };

    var petal = function(num) {
        this.elm = document.createElement('div');
        this.size = 's';
        this.t = 0;
        this.x = 0;
        this.vx = 0;
        this.py = 0;
        this.y = 0;
        this.rotateY = 0;
        this.rotateYUnit = getRandomInt(10, 80) / frameTime;
        this.rotateZ = getRandomInt(-5, 60);

        if (num % 5 == 1) this.size = 'm';
        if (num % 5 == 2) this.size = 'l';
        if (num % 5 == 3) this.size = 'w1';
        if (num % 5 == 4) this.size = 'w2';
        if (num % 5 == 5) this.size = 'w3';

        var imgUrl = '1234' + type + '/';
        this.elm.id = 'petal-' + num;
        this.elm.className = 'petal-model petal-model-' + this.size;
        if (this.size == 'l') {
            this.elm.innerHTML = '<img src="' + imgUrl + 'leaf-1.png" alt="" />';
        } else if (this.size == 'm') {
            this.elm.innerHTML = '<img src="' + imgUrl + 'leaf-2.png" alt="" />';
        } else if (this.size == 's') {
            this.elm.innerHTML = '<img src="' + imgUrl + 'leaf-3.png" alt="" />';
        } else if (this.size == 'w1') {
            this.elm.innerHTML = '<img src="' + imgUrl + 'leaf-4.png" alt="" />';
        } else if (this.size == 'w2') {
            this.elm.innerHTML = '<img src="' + imgUrl + 'leaf-5.png" alt="" />';
        } else {
            this.elm.innerHTML = '<img src="' + imgUrl + 'leaf-6.png" alt="" />';
        }
    };

    petal.prototype.init = function() {
        var move = $(window).width();
        if ($(window).width() <= 1080) {
            move = 1080;
        } else {
            move;
        }
        var deg = getRandomInt(0, 90);
        this.t = 0;
        this.x = getRandomInt(100, move) * -1;
        this.vx = getRandomInt(10, 1);
        this.py = getRandomInt(-200, stageHeight);
    };

    petal.prototype.build = function() {
        stage.appendChild(this.elm);
        this.init();
    };

    petal.prototype.move = function() {
        this.t += frameTime;
        this.x += this.vx + w;
        this.y = 1 / 2 * g * this.t * this.t + this.py;
        if (direction == 'left') {
            this.elm.style.top = this.y + 'px';
            this.elm.style.left = -this.x + 'px';
        } else {
            this.elm.style.top = this.y + 'px';
            this.elm.style.left = this.x + 'px';
        }
    };

    petal.prototype.rotate = function() {
        this.rotateY += this.rotateYUnit;
        this.elm.style.transform = 'rotateZ(' + this.rotateZ + 'deg) rotateY(' + this.rotateY + 'deg)';
    };

    petal.prototype.reset = function() {
        if (this.x < stageWidth && this.y < stageHeight) return;
        this.init();
    };

    var petalObjRender = function() {
        for (var i = 0; i < petalObjArr.length; i++) {
            petalObjArr[i].move();
            petalObjArr[i].rotate();
            petalObjArr[i].reset();
        }
    };

    var blowWind = function() {
        wDeg += 0.2;
        w = Math.pow(Math.sin(getRadian(wDeg)) + 1, 2);
    };

    var init = function() {
        for (var i = 0; i < petalNum; i++) {
            petalObjArr[i] = new petal(i);
            petalObjArr[i].build();
        }

        setInterval(function() {
            petalObjRender();
            blowWind();
        }, frameTime);
    };

    init();
}

function disableScroll() {
    scrollEnabled = false;

    setTimeout(function() {
        scrollEnabled = true;
    }, 1500);
}

function timerCountdown() {
    var distance = Date.parse('03/17/2019 15:15:00') - Date.parse(new Date())
        // Time calculations for days, hours, minutes and seconds
    var days = Math.floor(distance / (1000 * 60 * 60 * 24));
    var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((distance % (1000 * 60)) / 1000);
    $('#countdown').countdown({
        timestamp: {
            'days': days,
            'hours': hours,
            'minutes': minutes,
            'seconds': seconds
        },
        duration: 360,
    })
}
particlesJS("particles-js", { "particles": { "number": { "value": 160, "density": { "enable": true, "value_area": 800 } }, "color": { "value": "#ffffff" }, "shape": { "type": "circle", "stroke": { "width": 0, "color": "#000000" }, "polygon": { "nb_sides": 5 }, "image": { "src": "img/github.svg", "width": 100, "height": 100 } }, "opacity": { "value": 1, "random": true, "anim": { "enable": true, "speed": 1, "opacity_min": 0, "sync": false } }, "size": { "value": 3, "random": true, "anim": { "enable": false, "speed": 4, "size_min": 0.3, "sync": false } }, "line_linked": { "enable": false, "distance": 150, "color": "#ffffff", "opacity": 0.4, "width": 1 }, "move": { "enable": true, "speed": 1, "direction": "none", "random": true, "straight": false, "out_mode": "out", "bounce": false, "attract": { "enable": false, "rotateX": 600, "rotateY": 600 } } }, "interactivity": { "detect_on": "canvas", "events": { "onhover": { "enable": true, "mode": "bubble" }, "onclick": { "enable": true, "mode": "repulse" }, "resize": true }, "modes": { "grab": { "distance": 400, "line_linked": { "opacity": 1 } }, "bubble": { "distance": 250, "size": 0, "duration": 2, "opacity": 0, "speed": 3 }, "repulse": { "distance": 400, "duration": 0.4 }, "push": { "particles_nb": 4 }, "remove": { "particles_nb": 2 } } }, "retina_detect": true });