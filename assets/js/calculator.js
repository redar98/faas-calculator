(function ($) {

    // GBSecondCharge      — price for 1 second of computation time on 1 GB of memory allocation.
    // GHzSecondCharge     — price for 1 second of computation time on 1 GHz of CPU allocation.
    // RequestsCharge      — price for every 1,000,000 of invocations.
    // FreeTierGBSecond    — GB-Seconds of compute time included in free tier per month.
    // FreeTierRequests    — number of requests included in free tier per month.
    // DurationGranularity — minimum step for execution duration time (ms) used for increasing compute costs.
    // RequestsGranularity — minimum step for number of requests per month used for increasing requests costs.
    // values are actual as of 22.10.2021

    const awsParams = {
        charges: {
            gbs: 0.0000166667,
            invocations: 0.20
        },
        freeTier: {
            gbs: 400000,
            invocations: 1000000
        },
        granularity: {
            duration: 1,
            invocations: 1
        }
    };

    const azureParams = {
        charges: {
            gbs: 0.000016,
            invocations: 0.20
        },
        freeTier: {
            gbs: 400000,
            invocations: 1000000
        },
        granularity: {
            duration: 1,
            invocations: 1000000
        }
    };

    const googleParams = {
        charges: {
            gbs: 0.0000025,
            ghzs: 0.0000100,
            invocations: 0.40
        },
        freeTier: {
            gbs: 400000,
            ghzs: 200000,
            invocations: 2000000
        },
        granularity: {
            duration: 100,
            invocations: 1
        }
    };
    const googleMemoryMHzMap = { 128: 200, 256: 400, 512: 800, 1024: 1400, 2048: 2400, 4096: 4800, 8192: 4800 };

    const ibmParams = {
        charges: {
            gbs: 0.000017,
            invocations: 0
        },
        freeTier: {
            gbs: 400000,
            invocations: 0
        },
        granularity: {
            duration: 100,
            invocations: 1
        }
    };

    const vendors = [
        { name: "aws", params: awsParams },
        { name: "azure", params: azureParams},
        { name: "google", params: googleParams},
        { name: "ibm", params: ibmParams}
    ];

    const _ = undefined;
    const emptyResult = " ·";
    const thousandsRegex = /\B(?=(\d{3})+(?!\d))/g;


    $(function () {

        // return appropriate CPU MHz corresponding to the memory size ELSE estimate MHz based on previous memory size
        function estimateCPUForMemory(memorySize, cpuMHzMap) {
            var cpuMHz = cpuMHzMap[memorySize];

            if (cpuMHz == undefined)
                for (const key in cpuMHzMap)
                    if (key <= memorySize)
                        cpuMHz = cpuMHzMap[key] * (memorySize / key);

            return cpuMHz || 0;
        }

        function calculateCosts(inputParams, calcParams) {

            // get next closest execution duration (ms) by a granularity
            const executionsDuration = Math.ceil(inputParams.executionsDuration / calcParams.granularity.duration) * calcParams.granularity.duration;

            // calculate monthly GB seconds
            const computationSeconds = inputParams.executionsNumber * (executionsDuration / 1000);

            // memory (GB/sec) allocation costs
            var totalGbs = computationSeconds * (inputParams.memoryAllocation / 1024);
            totalGbs = inputParams.useFreeTier? Math.max(totalGbs - calcParams.freeTier.gbs, 0): totalGbs;
            var computationCost = totalGbs * calcParams.charges.gbs;
            
            // CPU (GHz/sec) allocation costs
            if (calcParams.charges.ghzs && calcParams.freeTier.ghzs) {
                var computationCpuGhz = computationSeconds * (inputParams.cpuAllocation / 1000);
                var cpuGhzCost = inputParams.useFreeTier? Math.max(computationCpuGhz - calcParams.freeTier.ghzs, 0): computationCpuGhz;

                computationCost += cpuGhzCost * calcParams.charges.ghzs;
            }

            // total invocation costs
            var totalInvocations = Math.ceil(inputParams.executionsNumber / calcParams.granularity.invocations) * calcParams.granularity.invocations;
            totalInvocations = inputParams.useFreeTier? Math.max(totalInvocations - calcParams.freeTier.invocations, 0): totalInvocations;

            var requestCost = totalInvocations * (calcParams.charges.invocations / 1000000);
            
            var result = {};
            result.computeCost = parseFloat(computationCost).toFixed(2);
            result.requestCost = parseFloat(requestCost).toFixed(2);
            result.monthlyCost = parseFloat(computationCost + requestCost).toFixed(2);

            return result;
        }

        function calculateExactComputeSeconds(inputParams) {
            return inputParams.executionsNumber * (inputParams.executionsDuration / 1000) * (inputParams.memoryAllocation / 1024);
        }

        function getInputParams() {
            var inputParams = {};

            inputParams.executionsNumber = $('#execution-number').val();
            inputParams.executionsDuration = $('#execution-time').val();
            inputParams.memoryAllocation = $('#memory-size').val();
            inputParams.useFreeTier = $('input[type=checkbox][name=free-tier]').is(":checked");

            if (inputParams.memoryAllocation) {
                inputParams.cpuAllocation = estimateCPUForMemory(inputParams.memoryAllocation, googleMemoryMHzMap);
            }

            return inputParams;
        }

        function isValidInput(inputParams) {
            return parseInt(inputParams.executionsNumber) && parseInt(inputParams.executionsDuration) && parseInt(inputParams.memoryAllocation)
        }

        function updateInfoText(inputParams) {
            const totalGbs = calculateExactComputeSeconds(inputParams);
            $('#total-gbs').text(totalGbs.toFixed(totalGbs < 10? 1: 0).replace(thousandsRegex, ','));
            $('#total-requests').text(inputParams.executionsNumber.replace(thousandsRegex, ','));

            document.getElementById("calc-info").classList.remove("hidden");
        }

        function updateText(vendor, results) {
            var requestsCost = results? results.requestCost: emptyResult;
            var computeCost = results? results.computeCost: emptyResult;
            var monthlyCost = results? results.monthlyCost: emptyResult;

            $(`#${vendor}-request-costs`).text(requestsCost);
            $(`#${vendor}-compute-costs`).text(computeCost);
            $(`#${vendor}-monthly-costs`).text(monthlyCost);
        }

        function clearText() {
            vendors.forEach(vendor => updateText(vendor.name));
            document.getElementById("calc-info").classList.add("hidden");
        }

        function update() {
            const inputParams = getInputParams();

            if (isValidInput(inputParams)) {
                vendors.forEach(vendor => {
                    var results = calculateCosts(inputParams, vendor.params);
                    updateText(vendor.name, results);
                });

                updateInfoText(inputParams);
            } else {
                clearText();
            }
        }

        vendors.forEach(vendor => {
            $(`#${vendor.name}-requests-charge`).text(vendor.params.charges.invocations);
            $(`#${vendor.name}-compute-charge`).text(vendor.params.charges.gbs);
        })

        $('#execution-number').on('input propertychange paste', () => update());
        $('#execution-time').on('input propertychange paste', () => update());
        $('#memory-size').on('change', () => update());
        $('#free-tier').on('change', () => update());
    });

})(jQuery);