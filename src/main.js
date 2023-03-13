//@ts-check - Get type warnings from the TypeScript language server. Remove if not wanted.

//import { enabled } from "../node_modules/colors/index";

let g_ChartObj;
let g_ChartType;
let g_ShowVolume;
let g_ShowLogScale;
let g_Size = {height : 0, width : 0};
let priceSeries;
let volumeSeries;
let g_OffsetHeight = 10;
let g_OffsetWidth = 10;
let g_IsEditing = false;

/**
 * Get access to the Spotfire Mod API by providing a callback to the initialize method.
 * @param {Spotfire.Mod} mod - mod api
 */
Spotfire.initialize(async (mod)=> {
    /**
     * Create the read function - its behavior is similar to native requestAnimationFrame, except
     * it's triggered when one of the listened to values changes. We will be listening for data,
     * properties and window size changes.
     */
    const reader = mod.createReader(
        mod.visualization.data(),
        mod.property("chartType"),
        mod.property("showVolume"),
        mod.property("showLogScale"),
        mod.windowSize()
    );

    const context = mod.getRenderContext();
    g_IsEditing = context.isEditing;
    g_OffsetWidth = g_IsEditing ? 40: 10; // make space for settings button


    /**
     * Initiate the read loop
     */
    reader.subscribe(render);


    /**
     * Aggregates incoming data and renders the chart
     *
     * @param {Spotfire.DataView} dataView
     * @param {Spotfire.ModProperty<string>} chartType
     * @param {Spotfire.ModProperty<string>} showVolume
     * @param {Spotfire.ModProperty<string>} showLogScale
     * @param {Spotfire.Size} size
     */
    async function render(dataView, chartType, showVolume, showLogScale, size) {

        /**
         * Check the data view for errors
         */
        let errors = await dataView.getErrors();
        if (errors.length > 0) {
            // Showing an error overlay will hide the mod iframe.
            // Clear the mod content here to avoid flickering effect of
            // an old configuration when next valid data view is received.
            mod.controls.errorOverlay.show(errors);
            return;
        }
        mod.controls.errorOverlay.hide();

        const g_UpColor = 'rgba(7, 137, 213, 0.955)';
        const g_DownColor = 'rgba(213, 7, 44, 0.955)';

        const g_UpColorTrans = 'rgba(7, 137, 213, 0.5)';
        const g_DownColorTrans = 'rgba(213, 7, 44, 0.5)';

        
        /**
         * Get rows from dataView
         */
        const rows = await dataView.allRows();

        

        /**
         * A helper function to compare a property against a certain value
         */
        const is = (property) => (value) => property.value() == value;
        if (rows == null) {
            // User interaction caused the data view to expire.
            // Don't clear the mod content here to avoid flickering.
            return;
        }

        /**
         * Extract styling from mod render context
         */
        const styling = context.styling;
        const textStyle = {
            fontSize: styling.scales.font.fontSize,
            fontName: styling.scales.font.fontFamily,
            color: styling.scales.font.color
        };

        let settingsIcon = document.querySelector(".settings");
        settingsIcon?.classList.toggle("hidden", !g_IsEditing);

        var priceDataSet = [];
        try {
            let hierarchy = await dataView.hierarchy("Time");
            if(!hierarchy.levels[0]) {
                mod.controls.errorOverlay.show("Please configure a column of type date on the Time axis.");
                return;
            }
            if(hierarchy.levels.length > 1) {
                mod.controls.errorOverlay.show("Only one level is allowed in the X hierarchy. There are curently " + hierarchy.levels.length);
                return;
            }
            if(!hierarchy.levels[0].dataType.isDate())
            {
                mod.controls.errorOverlay.show("Only date type is allowed on the x axis");
                return;
            }
        let leaves = (await hierarchy.root()).leaves();

        leaves.forEach( leaf =>
            {
                var debugRows =  leaf.rows();

                var tempRow = {};
                var timeValDate = leaf.value();
                var timeVal = 
                timeValDate.getUTCFullYear() + "-" +
                (timeValDate.getUTCMonth() + 1) + "-" +
                timeValDate.getUTCDate();

    
                if( leaf.rows().length < 1 )
                    return; //bailing

                
                tempRow["time"] = timeVal;

                    
                if( leaf.rows().length >0 )
                {
                    var openVal = leaf.rows()[0].continuous("Open").value();
                    if (openVal) {
                        tempRow["open"] = openVal;
                    }
                    else {
                        return; 
                    }
                }
                var highVal =  maxValue( leaf.rows(), "High");
                if (highVal) {
                    tempRow["high"] = highVal;
                }
                else {
                    return; 
               }

               var lowVal = minValue(leaf.rows(),"Low");
                
                if (lowVal ) {
                    tempRow["low"] = lowVal ;
                }
                else {
                    return; 
                }


                var closeVal = leaf.rows()[leaf.rows().length-1].continuous("Close").value();
                if (closeVal ) 
                {
                    tempRow["close"] = closeVal ;
                }
                else {
                    return; 
                }

                var volVal = sumValue(leaf.rows(), "Volume");
                
                if (volVal ) 
                {
                    tempRow["volume"] =volVal ;
                }
                else {
                    return; 
                }

                priceDataSet.push(tempRow);
                


            });

        } catch (error) {
            mod.controls.errorOverlay.show(error);
            return;   
        }

        let hasMarkedRows = priceDataSet.some(row => row.marked);

        var volumeDataSet = [];
        priceDataSet.forEach(row => volumeDataSet.push(
            {
                time: row.time,
                value: row.volume,
                color : (!row.marked && hasMarkedRows) ?  
                    (row.open > row.close ? g_DownColorTrans : g_UpColorTrans) :
                    (row.open > row.close ? g_DownColor : g_UpColor)
            }));


        const container = document.querySelector("#mod-container");
  
        var priceScaleMode = LightweightCharts.PriceScaleMode.Normal;
        g_ShowLogScale = showLogScale;
        if (g_ShowLogScale != null && is (g_ShowLogScale)(true))
        {
            priceScaleMode = LightweightCharts.PriceScaleMode.Logarithmic;
        }

        
 
        if (!g_ChartObj)
        {
            g_ChartObj = LightweightCharts.createChart(container, {
                width: size.width - g_OffsetWidth,
                height: size.height - g_OffsetHeight,
                layout: {
                    backgroundColor: styling.general.backgroundColor,//'#000000',
                    textColor: styling.scales.font.color, //'rgba(255, 255, 255, 0.9)',
                },
                grid: {
                    vertLines: {
                        color: 'rgba(197, 203, 206, 0.5)',
                    },
                    horzLines: {
                        color: 'rgba(197, 203, 206, 0.5)',
                    },
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Normal,
                },
                priceScale: {
                    borderColor: 'rgba(197, 203, 206, 0.8)',
                    mode: priceScaleMode,
                },
                timeScale: {
                     borderColor: 'rgba(197, 203, 206, 0.8)',
                     visible: true,
                },
            });

        }
        else
        {
            if (g_Size.height != size.height || g_Size.width != size.width)
            {
                g_ChartObj.resize(size.width - g_OffsetWidth, size.height -g_OffsetHeight);
    
            }

            g_ChartObj.applyOptions({
                    priceScale: {
                        mode:priceScaleMode,
                    },
                });

        }

        // Setting the global
        g_Size = {height : size.height, width : size.width};

        if (g_ChartType != chartType.value())
        {
            if (priceSeries)
                g_ChartObj.removeSeries(priceSeries);

            if (is(chartType)("candle")) {
                priceSeries = g_ChartObj.addCandlestickSeries({
                    upColor: g_UpColor,
                    downColor: g_DownColor,//'#000',
                    borderDownColor: g_DownColor,//'rgba(255, 144, 0, 1)',
                    borderUpColor: g_UpColor,//'rgba(255, 144, 0, 1)',
                    wickDownColor: g_DownColor,//'rgba(255, 144, 0, 1)',
                    wickUpColor: g_UpColor//'rgba(255, 144, 0, 1)',
                });
            }
            if (is(chartType)("bars")) {
                priceSeries = g_ChartObj.addBarSeries({
                    upColor: g_UpColor,//'rgba(255, 144, 0, 1)',
                    downColor: g_DownColor,//'#000',
                    borderDownColor: g_DownColor,//'rgba(255, 144, 0, 1)',
                    borderUpColor: g_UpColor,//'rgba(255, 144, 0, 1)',
                    wickDownColor: g_DownColor,//'rgba(255, 144, 0, 1)',
                    wickUpColor: g_UpColor//'rgba(255, 144, 0, 1)',
                });
                
            }

            g_ChartType = chartType.value();

            // document.body.onclick = function (e) {
            //     if (e.altKey)
            //     {
            //         showPopout({  x: e.clientX, y: e.clientY });
            //         return;
            //     }
            // }

            settingsIcon.addEventListener("click",
            function (e) {
                {
                    showPopout({    x: e.clientX, y: e.clientY });
                    return;
                }
            });


        }

        if(priceSeries)
        {
            priceSeries.setData(priceDataSet);
        }

        if (is(showVolume)("yes") && g_ShowVolume != "yes"){

                volumeSeries = g_ChartObj.addHistogramSeries({
                    //color: 'rgba(76, 175, 80, 0.5)',
                    color: 'rgba(255, 144, 0, 1)',
                    priceFormat: {
                        type: 'volume',
                    },
                    priceLineVisible: false,
            
                    overlay: true,
                    scaleMargins: {
                        top: 0.85,
                        bottom: 0,
                    },
                });

            g_ShowVolume = showVolume.value()
        }

        if (is(showVolume)("no") && g_ShowVolume != "no"){
            if (volumeSeries)
                g_ChartObj.removeSeries(volumeSeries);

            volumeSeries = null;
        }

        if (volumeSeries){
            volumeSeries.setData(volumeDataSet);
        }
        g_ShowVolume = showVolume.value();


         /**
         * Create popout content
         */
        const popoutContent = () => [
            section({
                heading: "Chart Type",
                children: [
                radioButton({
                    name: chartType.name,
                    text: "Candle Sticks",
                    value: "candle",
                    enabled: g_IsEditing,
                    checked: is(chartType)("candle")
                }),
                radioButton({
                    name: chartType.name,
                    text: "OHLC Bars",
                    value: "bars",
                    enabled: g_IsEditing,
                    checked: is(chartType)("bars")
                })]
            }),
            section({
                heading: "Options",
                children: [
                checkbox({
                    name: showLogScale.name,
                    text: "Log Scale",
                    checked: is(g_ShowLogScale)(true),
                    enabled: g_IsEditing
                }),
                checkbox({
                        name: showVolume.name,
                        text: "Show Volume",
                        //,
                        //checked: is(showVolume)("yes")
                        enabled: g_IsEditing,
                        checked: (g_ShowVolume == "yes")
                }),
            ]   
            })
        ];

        /**
         * Create a function to show a custom popout
         * Should be called when clicking on chart axes
         */
        const { popout } = mod.controls;
        const { section } = popout;
        const { radioButton } = popout.components;
        const { checkbox } = popout.components;

        function showPopout(e) {
            popout.show(
                {
                    x: e.x,
                    y: e.y,
                    autoClose: true,
                    alignment: "Bottom",
                    onChange: popoutChangeHandler
                },
                popoutContent
            );
        }




        /**
         * Calculate the max value for an axis from a set of rows. Null values are treated a 0.
         * @param {Spotfire.DataViewRow[]} rows Rows to calculate the max value from
         * @param {string} axis Name of Axis to use to calculate the value.
         */
        function maxValue(rows, axis) {
            if (rows.filter(function(el) {return el != null;}).length < 1) return null;
            
            return rows.reduce((p, c) => Math.max(+c.continuous(axis).value(), p), Number.MIN_VALUE);
        }

        /**
         * Calculate the max value for an axis from a set of rows. Null values are treated a 0.
         * @param {Spotfire.DataViewRow[]} rows Rows to calculate the max value from
         * @param {string} axis Name of Axis to use to calculate the value.
         */
        function minValue(rows, axis) {
            if (rows.filter(function(el) {return el != null;}).length < 1) return null;

            return rows.reduce((p, c) => Math.min(+c.continuous(axis).value(), p), Number.MAX_VALUE);
        }

        /**
         * Calculate the total value for an axis from a set of rows. Null values are treated a 0.
         * @param {Spotfire.DataViewRow[]} rows Rows to calculate the total value from
         * @param {string} axis Name of Axis to use to calculate the value.
         */
        function sumValue(rows, axis) {
            if (rows.filter(function(el) {return el != null;}).length < 1) return null;
            return rows.reduce((p, c) => +c.continuous(axis).value() + p, 0);
        }



        /**
         * Popout change handler
         * @param {Spotfire.PopoutComponentEvent} property
         */
        function popoutChangeHandler({ name, value }) {
            name == chartType.name && chartType.set(value);
            if (name == showVolume.name)
            { 
                if (value == true)
                    showVolume.set("yes");
                else
                    showVolume.set("no");
            }
            name == showLogScale.name && showLogScale.set(value);
        }

        /**
         * Signal that the mod is ready for export.
         */
        //context.signalRenderComplete(); //Not sure when done actually
    }    
});
