import React from 'react';
import { Container, Text } from '@harnessio/uicore';
import { Color, FontVariation } from '@harnessio/design-system';
import classNames from 'classnames';
import { parse } from 'yaml';
import { useParams } from 'react-router-dom';
import { getHash, getScope, normalize } from '@utils';
import config from '@config';
import type { GetChaosFaultRequest, GetChaosFaultResponse } from '@api/core';
import { useStrings } from '@strings';
import type { LazyQueryFunction } from '@api/types';
import Box from '@images/Box.svg';
import Loader from '@components/Loader';
import type { ChaosHub, Chart, FaultList } from '@api/entities/chaoshub';
import ExperimentCreationFaultHoverView from '@views/ExperimentCreationFaultHover';
import type { ChaosEngine, ChaosExperiment, FaultData } from '@models';
import { InfrastructureType } from '@api/entities';
import type { KubernetesYamlService } from '@services/experiment';
import { useSearchParams } from '@hooks';
import experimentYamlService from '@services/experiment';
import type { ChaosFaultData } from './types';
import css from './ExperimentCreationChaosFault.module.scss';

interface ExperimentCreationChaosFaultsViewProps {
  onSelect: (data: FaultData) => void;
  selectedHub: ChaosHub | undefined;
  filteredCharts: Chart[] | undefined;
  getChaosFaultQuery: LazyQueryFunction<GetChaosFaultResponse, GetChaosFaultRequest>;
  loading: {
    listChaosHub: boolean;
    listChaosFaults: boolean;
    getChaosFault: boolean;
  };
}

export default function ExperimentCreationChaosFaultsView({
  onSelect,
  selectedHub,
  filteredCharts,
  getChaosFaultQuery,
  loading
}: ExperimentCreationChaosFaultsViewProps): React.ReactElement {
  const scope = getScope();
  const { getString } = useStrings();
  const [isShown, setIsShown] = React.useState<boolean>(false);
  const [faultData, setFaultData] = React.useState<ChaosFaultData>();
  const { experimentKey } = useParams<{ experimentKey: string }>();
  const searchParams = useSearchParams();
  const infrastructureType = searchParams.get('infrastructureType') as InfrastructureType | undefined;
  const experimentHandler = experimentYamlService.getInfrastructureTypeHandler();

  function handleCRs(faultCR: string, engineCR: string): void {
    const parsedFaultCR = parse(faultCR) as FaultData['faultCR'];
    const faultName = parsedFaultCR?.metadata?.name ?? '';
    const generateName = getHash(3, faultName);

    if (infrastructureType === InfrastructureType.KUBERNETES) {
      const parsedEngineCR = parse(engineCR) as ChaosEngine;
      (experimentHandler as KubernetesYamlService)
        ?.preProcessChaosEngineManifest(
          experimentKey,
          parsedEngineCR,
          (parsedFaultCR as ChaosExperiment)?.spec?.definition.env ?? []
        )
        .then(chaosEngine => {
          onSelect({
            faultName: generateName,
            faultCR: parse(faultCR),
            engineCR: chaosEngine,
            weight: 10
          });
        });
      return;
    }

    onSelect({
      faultName: generateName,
      faultCR: parse(faultCR),
      weight: 10
    });
  }

  const onSelectFault = (chart: Chart, fault: FaultList, viewOnly: boolean): void => {
    getChaosFaultQuery({
      variables: {
        projectID: scope.projectID,
        request: {
          category: chart.metadata.name,
          experimentName: fault.name,
          hubID: selectedHub?.id ?? ''
        }
      }
    }).then(data => {
      setFaultData({
        category: chart.metadata.name,
        fault: fault,
        faultCSV: data.data?.getChaosFault.csv
      });
      setIsShown(true);

      if (!viewOnly && data.data?.getChaosFault?.fault) {
        handleCRs(data.data.getChaosFault.fault, data.data.getChaosFault.engine ?? '');
      }
    });
  };

  return (
    <div className={css.root}>
      <div
        className={css.leftDiv}
        style={{ overflow: loading.getChaosFault || loading.listChaosHub ? 'hidden' : 'auto' }}
      >
        <Text color={Color.BLACK} font={{ variation: FontVariation.H4 }}>
          {selectedHub?.name}
        </Text>
        <Loader loading={loading.listChaosFaults || loading.listChaosHub}>
          {filteredCharts
            ? filteredCharts.map(
                chart =>
                  // Render only Hub faults which have at least one fault
                  chart.spec.faults.length > 0 && (
                    <div
                      key={chart.metadata.name}
                      id={chart.metadata.name}
                      className={classNames(css.card, css.widthSm)}
                    >
                      <Text color={Color.BLACK} font={{ variation: FontVariation.H5 }}>
                        {/* Convert id based name to normal casing normalize(an-experiment) to An experiment */}
                        {normalize(chart.metadata.name)}
                      </Text>
                      <div className={css.listContainer}>
                        {chart.spec.faults.map((fault: FaultList) => {
                          return (
                            <div
                              key={fault.name}
                              className={css.experimentWrapper}
                              onClick={() => onSelectFault(chart, fault, false)}
                              onMouseEnter={() => onSelectFault(chart, fault, true)}
                              onMouseLeave={() => setIsShown(false)}
                            >
                              <div className={css.box}>
                                <img
                                  loading="lazy"
                                  src={
                                    selectedHub?.isDefault
                                      ? `${config.restEndpoints?.chaosManagerUri}/icon/default/${selectedHub?.name}/${chart.metadata.name}/${fault.name}.png`
                                      : `${config.restEndpoints?.chaosManagerUri}/icon/${scope.projectID}/${selectedHub?.name}/${chart.metadata.name}/${fault.name}.png`
                                  }
                                  alt={`${fault.name} icon`}
                                />
                              </div>
                              <Text className={css.center} font={{ variation: FontVariation.BODY }}>
                                {fault.displayName !== '' ? fault.displayName : fault.name}
                              </Text>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
              )
            : !loading.listChaosFaults &&
              !loading.listChaosHub && (
                <Container height="100%" className={css.noFaults}>
                  <Text font={{ variation: FontVariation.H5, weight: 'light' }} color={Color.GREY_500}>
                    {getString('noFaults')}
                  </Text>
                </Container>
              )}
        </Loader>
      </div>
      <div className={css.rightDiv}>
        {isShown ? (
          <ExperimentCreationFaultHoverView
            selectedHub={selectedHub}
            faultData={faultData}
            loading={{
              getChaosFault: loading.getChaosFault
            }}
          />
        ) : (
          <div className={css.relative}>
            <img src={Box} alt={getString('hoverFaultToViewDetails')} />
            <Text>{getString('hoverFaultToViewDetails')}</Text>
          </div>
        )}
      </div>
    </div>
  );
}
