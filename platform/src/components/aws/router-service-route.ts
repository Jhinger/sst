import { ComponentResourceOptions, Input, all, output } from "@pulumi/pulumi";
import { Component } from "../component";
import {
  buildKvNamespace,
  createKvRouteData,
  parsePattern,
  RouterBaseRouteArgs,
  updateKvRoutes,
} from "./router-base-route";
import { Service } from "./service";
import { RouterServiceRouteArgs } from "./router";
import { toSeconds } from "../duration";
import { cloudfront } from "@pulumi/aws";
import { hashStringToPrettyString } from "../naming";

export interface Args extends RouterBaseRouteArgs {
  /**
   * The Service to route to.
   */
  service: Input<Service>;
  /**
   * Additional arguments for the route.
   */
  routeArgs?: Input<RouterServiceRouteArgs>;
}

/**
 * The `RouterServiceRoute` component is internally used by the `Router` component
 * to add routes to a Service via VPC Origin.
 *
 * :::note
 * This component is not intended to be created directly.
 * :::
 *
 * You'll find this component returned by the `routeService` method of the `Router` component.
 */
export class RouterServiceRoute extends Component {
  constructor(name: string, args: Args, opts?: ComponentResourceOptions) {
    super(__pulumiType, name, args, opts);

    const self = this;

    all([args.pattern, args.routeArgs, args.service]).apply(
      ([pattern, routeArgs, service]) => {
        const patternData = parsePattern(pattern);
        const namespace = buildKvNamespace(name);

        const lb = output(service.nodes.loadBalancer);
        const albArn = lb.arn;
        const albDnsName = lb.dnsName;

        const protocol = routeArgs?.protocol ?? "https-only";

        const vpcOrigin = new cloudfront.VpcOrigin(
          `${name}VpcOrigin`,
          {
            vpcOriginEndpointConfig: {
              name: `${name}-${hashStringToPrettyString(name, 8)}`,
              arn: albArn,
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: protocol,
              originSslProtocols: {
                items: ["TLSv1.2"],
                quantity: 1,
              },
            },
          },
          { parent: self },
        );

        createKvRouteData(name, args, self, namespace, {
          domain: albDnsName,
          vpcOriginId: vpcOrigin.id,
          rewrite: routeArgs?.rewrite,
          origin: {
            protocol: protocol,
            connectionAttempts: routeArgs?.connectionAttempts,
            timeouts: (() => {
              const timeouts: [string, number][] = [];
              if (routeArgs && typeof routeArgs === "object") {
                if ("connectionTimeout" in routeArgs && routeArgs.connectionTimeout) {
                  timeouts.push(["connectionTimeout", toSeconds(routeArgs.connectionTimeout as any)]);
                }
                if ("readTimeout" in routeArgs && routeArgs.readTimeout) {
                  timeouts.push(["readTimeout", toSeconds(routeArgs.readTimeout as any)]);
                }
                if ("keepAliveTimeout" in routeArgs && routeArgs.keepAliveTimeout) {
                  timeouts.push(["keepAliveTimeout", toSeconds(routeArgs.keepAliveTimeout as any)]);
                }
              }
              return timeouts.length ? Object.fromEntries(timeouts) : undefined;
            })(),
          },
        });

        updateKvRoutes(name, args, self, "service", namespace, patternData);
      },
    );
  }
}

const __pulumiType = "sst:aws:RouterServiceRoute";
// @ts-expect-error
RouterServiceRoute.__pulumiType = __pulumiType;
