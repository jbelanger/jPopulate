/*!
* jPopulate v1.0.0
*
* Copyright 2012, Joel Belanger
*
* Permission is hereby granted, free of charge, to any person obtaining
* a copy of this software and associated documentation files (the
* "Software"), to deal in the Software without restriction, including
* without limitation the rights to use, copy, modify, merge, publish,
* distribute, sublicense, and/or sell copies of the Software, and to
* permit persons to whom the Software is furnished to do so, subject to
* the following conditions:
* 
* The above copyright notice and this permission notice shall be
* included in all copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
* NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
* LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
* OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
* WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
* Date: Mon Aug 27 2012
*/
(function ($) {

    $.fn.jpopulate = function (methodOrOptions) {
        var args = arguments,
            retValue = null;

        this.each(function () {
            if (!this.populate)
                this.populate = new jPopulateModule(this, methodOrOptions);

            if (this.populate[methodOrOptions])
                retValue = this.populate[methodOrOptions].apply(this, Array.prototype.slice.call(args, 1));
        });

        return retValue;
    };

    /// *****************************************
    /// Databind module.
    /// OO approach to call plugin methods
    /// *****************************************
    var jPopulateModule = function (element, options) {

        var lastSelected,
            cache,
            instance = this;

        var settings = {
            onAfterBindObject: function () { },
            onBeforeUpdate: function (dto) { return dto; }
        };

        if (options) $.extend(settings, options);

        init(element);

        ///
        /// Public functions
        ///

        this.update = function (obj) {

            if (typeof (obj) == "string")
                lastSelected = jQuery.parseJSON(obj);
            else
                lastSelected = obj;

            if (lastSelected != null) {
                $.each(cache, function (boundField) {
                    fillElements(boundField, this, lastSelected);
                });
            }
            if (settings.onAfterBindObject)
                settings.onAfterBindObject(lastSelected);
        }

        ///
        /// Builds a javascript object out of all the form elements
        ///
        this.buildObject = function () {
            var dto = {};

            $.each(cache, function (boundField) {
                $.each(this, function (index, $elements) {

                    if ($elements.length > 0) {
                        if (isFieldArray(boundField)) {
                            var arrayOfSelected = [],
                                parts = boundField.split('/'),
                                arrayName = parts[0],
                                fieldPath = parts[1];

                            if (hasRepeaterValues($elements))
                                arrayOfSelected = processSubProperties(boundField);
                            else {
                                var checked;
                                if (this.is("select"))
                                    checked = this.find(":checked,:selected");
                                else
                                    checked = this.filter(":checked,:selected");

                                if (fieldPath == "") {
                                    // Simple literal array
                                    checked.each(function () {
                                        arrayOfSelected.push($(this).val());
                                    });
                                }
                                else {
                                    checked.each(function () {
                                        var newObj = createInnerObject(fieldPath, $(this).val(), null);
                                        arrayOfSelected.push(newObj);
                                    });
                                }
                            }
                            dto[arrayName] = arrayOfSelected;
                        }
                        else
                            buildObjectField(boundField, $elements, dto);
                    }
                });
            });

            return dto;
        }

        this.disable = function () {
            $.each(cache, function (boundField) {
                $.each(this, function (index, $elements) {
                    $elements.attr("disabled", "disabled");
                });
            });
        }

        this.enable = function () {
            $.each(cache, function (boundField) {
                $.each(this, function (index, $elements) {
                    $elements.removeAttr("disabled");
                });
            });
        }

        this.reset = function () {
            $.each(cache, function (boundField) {
                $.each(this, function (index, $elements) {
                    $.each($elements.get(), function () {
                        switch (this.type) {
                            case "select-multiple":
                                this.selectedIndex = -1;
                                break;
                            case "select-one":
                                this.selectedIndex = 0;
                                break;
                            case "radio":
                            case "checkbox":
                                this.checked = false;
                                break;
                            default:
                                this.value = "";
                                break;
                        }
                    });
                });
            });
        }


        /// 
        /// Private functions
        /// 

        function init(selector) {
            var dataField,
                $thisElement,
                $containedInputs,
                $element;

            // Initialize cache
            cache = {};

            if ($(selector).attr("data-field"))
                $element = $(selector);
            else
                $element = $(selector).find("[data-field]");

            $element.each(function () {
                $thisElement = $(this);
                dataField = $thisElement.attr("data-field");

                if (!cache[dataField])
                    cache[dataField] = [];

                if ($thisElement.is("input:radio")) {
                    if (cache[dataField].length == 0) {
                        $thisElement = $(element).find("input:radio[name=" + $thisElement.attr("name") + "]");
                        cache[dataField].push($thisElement);
                    }
                }
                else {
                    if ($thisElement.is("input,select,textarea"))
                        $containedInputs = $thisElement;
                    else {
                        $containedInputs = $thisElement.find("select, input, textarea");
                        $("[data-dataitemid]", $thisElement).each(function () {
                            var idPropValue = $(this).attr("data-dataitemid");

                            // Cache list of all dataitems AND their data-bind elements to prevent 
                            // too much DOM reads.
                            var repeater = $containedInputs.data("repeater");
                            if (!repeater) repeater = {};
                            repeater[idPropValue.toString()] = getListOfBindings(idPropValue.toString(), $(this))

                            $containedInputs.data("repeater", repeater);
                        });
                    }
                    cache[dataField].push($containedInputs);
                }
            });
        }

        ///
        /// Builds a list of objects containing all the repeater's
        /// inner sub properties (data-bind attribute on elements). 
        /// 
        function getListOfBindings(idPropValue, $element) {
            var listOfBindings = [],
            $elementDataBind;

            $("[data-bind]", $element).each(function () {
                var input = {};
                $elementDataBind = $(this);
                input["el"] = $elementDataBind;
                input["prop"] = $elementDataBind.attr("data-bind");
                input["type"] = $elementDataBind.attr("type");
                listOfBindings.push(input);
            });
            return listOfBindings;
        }

        function fillElements(boundFieldName, arrayOfElements, objectToBind) {

            var propContent = getProperty(objectToBind, boundFieldName);
            var renderOnly, editControl;

            $.each(arrayOfElements, function (index, $elements) {
                var $thisElement = this;

                if ($.isArray(propContent)) {
                    if (hasRepeaterValues($elements))
                        fillRepeater(boundFieldName, $elements, propContent);
                    else {
                        var idsArray = [];

                        $.each(propContent, function () {
                            if (jQuery.isPlainObject(this)) {
                                var dataField = boundFieldName.substr(boundFieldName.indexOf("/") + 1);
                                if (dataField)
                                    var fieldValue = getProperty(this, dataField);
                                if (fieldValue)
                                    idsArray.push(fieldValue);
                            }
                            else
                                idsArray.push(this); // Simple literal array
                        });

                        if ($elements.length > 0)
                            $elements.val(idsArray);
                        else if ($thisElement.is("select"))
                            $thisElement.val(idsArray);
                        else if ($thisElement.children().length == 0)
                            $thisElement.html(idsArray.toString());
                    }
                }
                else {
                    var $containedInputs = $elements;

                    if ($containedInputs.length == 1) {
                        if ($containedInputs.is(":file")) {
                            ; // Nothing to do
                        }
                        else if ($containedInputs.is(":checkbox")) {
                            if (propContent == "true" || propContent)
                                $containedInputs.attr("checked", "checked");
                            else
                                $containedInputs.removeAttr("checked");
                        }
                        else
                            $containedInputs.val(propContent);
                    }
                    else if ($containedInputs.is(":radio") || $containedInputs.is(":checkbox") || $containedInputs.attr("multiple")) {
                        // From jQuery documentation for val()
                        // Passing an array of element values allows matching <input type="checkbox">, 
                        // <input type="radio"> and <option>s inside of n <select multiple="multiple"> 
                        // to be selected. In the case of <input type="radio">s that are part of a 
                        // radio group and <select multiple="multiple"> the other elements will be 
                        // deselected.
                        $containedInputs.val([propContent]);
                    }
                }
            });
        }

        ///
        /// Get the property from the object based on the 
        /// property name specified in the markup span. 
        ///
        function getProperty(dataItem, propertyName) {
            if (dataItem == null)
                return null;

            var prop,
                parts;

            if (isFieldArray(propertyName))
                propertyName = propertyName.substr(0, propertyName.indexOf("/"));

            parts = propertyName.split('.');
            if (parts.length > 1) {
                prop = dataItem;
                for (var i = 0; i < parts.length; i++) {
                    if (prop == null)
                        break;

                    prop = prop[parts[i]];
                }
            }
            else
                prop = dataItem[propertyName];

            return prop;
        }

        ///
        /// Determines if the fieldName (data-field attribute) contains
        /// an array/list description
        ///
        function isFieldArray(fieldName) {
            return fieldName.indexOf("/") != -1;
        }

        ///
        /// Determines if data-field element contains other 
        /// properties to bind (data-bind attribute)
        /// 
        function hasRepeaterValues($elements) {
            return $elements.data("repeater");
        }

        ///
        /// Fill all properties to their data-bind elements.
        /// 
        function fillRepeater(boundField, $element, arrayToBind) {
            var subProp,
                inputType,
                item,
                parts = boundField.split("/"),
                idProp = parts[1],
                idPropValue;

            instance.reset();

            for (var i = 0; i < arrayToBind.length; i++) {
                idPropValue = getProperty(arrayToBind[i], idProp);

                $.each($element.data("repeater")[idPropValue.toString()], function () {
                    var inputDef = this;
                    var $elementDataBind = inputDef["el"];

                    subProp = getProperty(arrayToBind[i], inputDef["prop"]);
                    if (subProp != null) {
                        inputType = inputDef["type"];
                        if (inputType == "checkbox") {
                            if (subProp != false)
                                $elementDataBind.attr("checked", "checked");
                        }
                        else if (inputType == "radio") {
                            if ($elementDataBind.val() == subProp)
                                $elementDataBind.attr("checked", "checked");
                        }
                        else
                            $elementDataBind.val(subProp);
                    }
                });
            }
        }

        ///
        /// Returns an object with all its subproperties 
        /// and the value assigned to the last (deepest) property.
        ///
        function createInnerObject(objectName, value, objRef) {
            var newObj = (!objRef) ? {} : objRef,
                    lastObjCreated = newObj,
                    fieldParts;

            fieldParts = objectName.split('.');

            if (fieldParts.length > 1) {
                for (var i = 0; i < (fieldParts.length - 1); i++) {
                    var thisPart = fieldParts[i];

                    if (lastObjCreated[thisPart] == null) lastObjCreated[thisPart] = {};

                    lastObjCreated = lastObjCreated[thisPart];
                }
            }

            lastObjCreated[fieldParts[fieldParts.length - 1]] = (value) ? value : '';

            return newObj;
        }

        ///
        /// Literal values.
        /// Creates properties inside the object and assign the value
        /// For fields that are not multiselect (arrays). 
        ///
        function buildObjectField(fieldName, $elements, objRef) {
            if ($elements.is(":radio"))
                createInnerObject(fieldName, $elements.filter(":checked").val(), objRef);
            else {
                var editorVal = $elements.val();

                if ($elements.is(":checkbox")) {
                    if ($elements.is(":checked"))
                        editorVal = true;
                    else
                        editorVal = false;
                }

                // Only save if value not null or empty since we don't know 
                // what type the property is. We leave that empty so the 
                // javascript serializer in the web service knows how to
                // serialize it.
                ////                if (editorVal != -1 && editorVal != "")
                createInnerObject(fieldName, editorVal, objRef);
            }
        }

        ///
        /// In case of repeater bindings, get all subproperties
        ///
        function processSubProperties(boundFieldName) {
            var array = [],
                subPropertyName,
                parts = boundFieldName.split("/"),
                dataItemKey = parts[1];

            $.each(cache[boundFieldName], function (index, $elements) {
                $.each($elements.data("repeater"), function (dataItemId, arrayOfInputDefs) {
                    var obj = {};

                    $.each(arrayOfInputDefs, function () {
                        var inputDef = this;
                        var $elementDataBind = inputDef["el"];
                        subPropertyName = inputDef["prop"];

                        if (subPropertyName == dataItemKey) {
                            // First checks if is selected before adding it.
                            if (!($elementDataBind.is(":checked") || $elementDataBind.is(":selected"))) {
                                // Don't save anything.
                                obj = null;
                                return false;
                            }
                        }

                        if ($elementDataBind.is("input:radio") || $elementDataBind.is("input:checkbox")) {
                            if ($elementDataBind.is(":checked"))
                                createInnerObject(subPropertyName, $elementDataBind.val(), obj);
                        }
                        else
                            createInnerObject(subPropertyName, $elementDataBind.val(), obj);
                    });

                    // Finally, add the key property
                    if (obj) {
                        createInnerObject(dataItemKey, dataItemId, obj);
                        array.push(obj);
                    }
                });
            });
            return array;
        }
    };
})(jQuery);