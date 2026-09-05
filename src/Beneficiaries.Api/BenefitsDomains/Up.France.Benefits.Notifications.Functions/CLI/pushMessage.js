const { EventHubProducerClient } = require("@azure/event-hubs");

// Connection string to your Event Hubs namespace
const connectionString =
  "Endpoint=sb://mu-fr-prd-wl.servicebus.windows.net/;SharedAccessKeyName=Fabrik;SharedAccessKey=yYuv8+N1T0f4NdpIUp76s70rGZhN0o20xoYogG+C0oE=;";

// Name of the event hub
const eventHubName = "fr-ef1t-preprod";

async function main() {
  // Create an Event Hub producer client
  const producer = new EventHubProducerClient(connectionString, eventHubName, { "maxRetries": 2, "retryDelayInMs": 3000 });

  // Define the event to be sent
  const eventData = {
    notification: {
      distributorRef: "UPFRANCE",
      interfaceVersion: 19,
      message: {
        funderContractRef: "GENERIQUE",
        productRef: "PRDHYREPASUPFRANCE",
        messageId: 80844678,
        messageDate: "2024-09-12T14:51:52.323+00:00",
        beneficiaryServiceRef: "698e004045c14fc5acbb30eb4eebd972",
        contextData: {
          operationDateTime: "2024-09-12T14:51:49+00:00",
          operationType: "AUTHORIZATION",
          operationNature: "PURCHASE",
          operationAmount: { amount: 2500, exponent: 2, currency: "978" },
          accountBalance: { amount: 4638, exponent: 2, currency: "978" },
          accountAvailable: { amount: 0, exponent: 2, currency: "978" },
          codeMCC: "5812",
          canalAcceptationValue: "pdp",
          nomMarchand: "SAINTANE",
          dateTransaction: "2024-09-12T14:51:36+00:00",
          dateTransmissionTransaction: "0912145136",
          saeTimeSpent: 317,
          idContratAffilie: "UP-A1-00023582",
          idAcceptation: "92500010000",
          idMarchand: "1008390",
          villeMarchand: "PARIS",
          codepostalMarchand: "75001",
          numAut: "252709",
          cardId: "2000000024451274",
          psn: 0,
          truncatedPAN: "519303******7261   ",
          codeRetour: "00",
          idTerminal: "QS03BDF2",
          traceNumber: "000010",
          posEntryMode: "000072",
          amount: { amount: 2500, exponent: 2, currency: "978" },
          countryCode: "250",
          respPartialApprovalFlag: "N",
          respCardStatus: "ACTIVE",
          voucherImpacts: {
            voucherImpact: [
              {
                externalReference: "1a55969cb10f44019c0acdc8cc569a29",
                amountImpact: { amount: -2500, exponent: 2, currency: "978" },
                voucherReason: "DEMAHYBR|WEB|6",
              },
            ],
          },
          authorizationReference: "9226ab31c12c4da8840bbe7d6081492d",
          xpay: {},
          cardSchemeCode: "PRI",
          mask: "MCHIP",
          indCheckCvx2: "N",
          prdCheckCvx2: "N",
          indPresenceCvx2: "N",
          addMerchantData: {},
        },
      },
    },
  };

  try {
    // Create a batch
    const batch = await producer.createBatch();
    console.log(`Event created: ${batch}`);
    batch.tryAdd(eventData);

    // Send the batch
    await producer.sendBatch(batch);
    console.log(`Event sent: ${eventData.body}`);
  } finally {
    // Close the producer client
    await producer.close();
  }
}

// Call the main function
main().catch((err) => {
  console.error("Error occurred: ", err);
});
